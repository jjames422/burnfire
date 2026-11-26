import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { audit, requireIntel, UUID } from "@/lib/server/intel";
import { jsonError } from "@/lib/server/http";

const record = z.object({
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["throne", "merger", "disband", "ranking", "kvk", "season", "diplomacy", "other"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(2000).optional().default(""),
  alliance_id: z.string().regex(UUID).nullable().optional(),
  verification: z.enum(["verified", "reported"]),
  visibility: z.enum(["public", "members", "leadership"]),
});

/** Manually entered kingdom records are always labeled as leadership entries. */
export async function POST(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const parsed = record.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Add a date, type, and title for the record.");
  const value = parsed.data;
  const [row] = await query<{ id: string }>(
    `insert into intel_kingdom_events (kingdom, occurred_at, kind, title, body, alliance_id, source, verification, visibility, tenant, created_by)
     select $1, $2::date, $3, $4, nullif($5, ''), a.id, 'manual', $6, $7, $8, $9
     from (select $10::uuid as id) input left join intel_alliances a on a.id = input.id and a.kingdom = $1
     returning id`,
    [gate.access.kingdom ?? 324, value.occurred_at, value.kind, value.title, value.body, value.verification,
      value.visibility, gate.tenant, gate.user.id, value.alliance_id ?? null],
  );
  await audit(gate.tenant, gate.user.id, "kingdom.record", `event:${row.id}`, { kind: value.kind, visibility: value.visibility });
  return NextResponse.json({ id: row.id });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return jsonError("Record was not found.", 404);
  const rows = await query<{ id: string }>(
    `delete from intel_kingdom_events where id = $1 and source = 'manual' and tenant = $2 returning id`, [id, gate.tenant]);
  if (!rows.length) return jsonError("Only your alliance's manual records can be removed.", 404);
  await audit(gate.tenant, gate.user.id, "kingdom.record.remove", `event:${id}`);
  return NextResponse.json({ ok: true });
}
