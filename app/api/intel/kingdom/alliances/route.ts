import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { activeProviderId, audit, requireIntel, syncDeps, UUID } from "@/lib/server/intel";
import { trackAllianceByTag } from "@/lib/intel/sync.ts";
import { jsonError } from "@/lib/server/http";

const add = z.object({ tag: z.string().trim().min(1).max(18) });
const change = z.object({ id: z.string().regex(UUID), tracked: z.boolean() });

const providerMessages: Record<string, string> = {
  missing_key: "The tracker API key is not configured yet. Ask a platform administrator.",
  auth: "The tracker rejected the configured API key.",
  not_found: "No alliance with that tag was found in this kingdom.",
  ambiguous: "More than one alliance uses that tag. Enter the exact capitalization.",
  rate_limited: "Today's tracker request budget is used up. Try again after 00:00 UTC.",
};

/** Leadership chooses which kingdom alliances are tracked (aggregates only). */
export async function POST(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const parsed = add.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter an alliance tag.");
  const { rows: [{ count }] } = { rows: await query<{ count: number }>(
    `select count(*)::int as count from intel_alliances where kingdom = $1 and provider = $2 and tracked`,
    [gate.access.kingdom ?? 324, activeProviderId()]) };
  if (count >= 60) return jsonError("Up to 60 alliances can be tracked per kingdom.");
  const result = await trackAllianceByTag(syncDeps(), activeProviderId(), gate.access.kingdom ?? 324, parsed.data.tag, gate.user.id);
  if ("error" in result) {
    return jsonError(providerMessages[result.error.code] ?? "The tracker could not be reached. Try again shortly.", result.error.code === "not_found" ? 404 : 502);
  }
  await audit(gate.tenant, gate.user.id, "kingdom.track", `alliance:${result.allianceId}`, { tag: parsed.data.tag });
  return NextResponse.json({ id: result.allianceId, status: result.outcome.status });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireIntel("leadership");
  if (gate.response) return gate.response;
  const parsed = change.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Choose an alliance.");
  const rows = await query<{ id: string }>(
    `update intel_alliances set tracked = $2 where id = $1 and tenant is null and kingdom = $3 returning id`,
    [parsed.data.id, parsed.data.tracked, gate.access.kingdom ?? 324],
  );
  if (!rows.length) return jsonError("That alliance cannot be changed here.", 404);
  await audit(gate.tenant, gate.user.id, parsed.data.tracked ? "kingdom.track" : "kingdom.untrack", `alliance:${parsed.data.id}`);
  return NextResponse.json({ ok: true });
}
