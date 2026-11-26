import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { audit, requireIntel, UUID } from "@/lib/server/intel";
import { jsonError } from "@/lib/server/http";

const milestone = z.object({
  start_day: z.number().int().min(1).max(5000),
  end_day: z.number().int().min(1).max(5000).nullable(),
  title: z.string().trim().min(1).max(80),
  kind: z.enum(["event", "season", "unlock", "other"]),
  certainty: z.enum(["confirmed", "estimated"]),
  notes: z.string().trim().max(300).nullable(),
});

/** Leadership maintains the server-age progression the provider does not expose. */
export async function POST(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const parsed = milestone.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.end_day !== null && parsed.data.end_day < parsed.data.start_day)) {
    return jsonError("Add a title and a start day (and an end day after it, if any).");
  }
  const value = parsed.data;
  const kingdom = gate.access.kingdom ?? 324;
  const [row] = await query<{ id: string }>(
    `insert into intel_kingdom_milestones (kingdom, start_day, end_day, title, kind, certainty, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (kingdom, start_day, title) do update set end_day = $3, kind = $5, certainty = $6, notes = $7
     returning id`,
    [kingdom, value.start_day, value.end_day, value.title, value.kind, value.certainty, value.notes || null, gate.user.id],
  );
  await audit(gate.tenant, gate.user.id, "kingdom.milestone", `milestone:${row.id}`, { day: value.start_day, certainty: value.certainty });
  return NextResponse.json({ id: row.id });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return jsonError("Milestone was not found.", 404);
  const rows = await query(`delete from intel_kingdom_milestones where id = $1 and kingdom = $2 returning id`, [id, gate.access.kingdom ?? 324]);
  if (!rows.length) return jsonError("Milestone was not found.", 404);
  await audit(gate.tenant, gate.user.id, "kingdom.milestone.remove", `milestone:${id}`);
  return NextResponse.json({ ok: true });
}
