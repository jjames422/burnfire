import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/server/auth";
import { queryOne, query } from "@/lib/server/db";
import { audit, getIntelAccess, requireIntel } from "@/lib/server/intel";
import { loadKingdom } from "@/lib/server/intel-queries";
import { jsonError } from "@/lib/server/http";

const DEFAULT_KINGDOM = 324;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const compare = (params.get("compare") ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const days = [7, 30, 90, 180].includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;
  const user = await getSessionUser();
  const access = user ? await getIntelAccess(user.id) : null;
  const kingdom = access?.kingdom ?? DEFAULT_KINGDOM;
  if (!access?.member) {
    // Visitors and unaffiliated accounts see aggregates only, and only when the
    // kingdom's home alliance has chosen to publish them.
    const published = await queryOne<{ ok: boolean }>(
      `select true as ok from intel_settings s join alliances a on a.slug = s.tenant
       where a.kingdom_number = $1 and s.kingdom_public limit 1`, [kingdom]);
    if (!published) return jsonError("Kingdom intelligence is available to verified alliance members.", user ? 403 : 401);
  }
  const data = await loadKingdom(kingdom, {
    tenant: access?.tenant ?? null, leadership: access?.leadership ?? false, publicOnly: !access?.member,
  }, compare, days);
  return NextResponse.json({ ...data, viewer: { leadership: access?.leadership ?? false, member: access?.member ?? false } },
    { headers: { "Cache-Control": "private, no-store" } });
}

const metadata = z.object({
  name: z.string().trim().max(80).nullable(),
  opened_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  season: z.string().trim().max(80).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

/** Leadership maintains kingdom facts the provider does not expose. */
export async function PATCH(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const parsed = metadata.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the kingdom details and try again.");
  const kingdom = gate.access.kingdom ?? DEFAULT_KINGDOM;
  const { name, opened_on, season, notes } = parsed.data;
  await query(
    `insert into intel_kingdoms (number, name, opened_on, season, notes, source, updated_by, updated_at)
     values ($1, $2, $3, $4, $5, 'manual', $6, now())
     on conflict (number) do update set name = $2, opened_on = $3, season = $4, notes = $5, source = 'manual', updated_by = $6, updated_at = now()`,
    [kingdom, name || null, opened_on, season || null, notes || null, gate.user.id],
  );
  await audit(gate.tenant, gate.user.id, "kingdom.update", `kingdom:${kingdom}`, { fields: Object.keys(parsed.data) });
  return NextResponse.json({ ok: true });
}
