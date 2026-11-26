import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/intel/secret.ts";
import { normalizeRank, rosterTitle } from "@/lib/intel/roster-sync.ts";
import { homeRoster } from "@/lib/server/roster";
import { jsonError } from "@/lib/server/http";

/**
 * Machine endpoint for the alliance's community bot: the current roster of the
 * tenant's own alliance (character ID, in-game name, rank). Used to admit
 * members whose details match and to keep their rank roles in step.
 */
export async function GET(request: NextRequest) {
  if (!process.env.INTEL_REPORT_SECRET) return jsonError("Reports are not configured.", 503);
  if (!secretMatches(request.headers.get("authorization"), process.env.INTEL_REPORT_SECRET)) return jsonError("Unauthorized.", 401);
  const tenant = request.nextUrl.searchParams.get("tenant") ?? "burnfire";
  if (!/^[a-z0-9-]{2,40}$/.test(tenant)) return jsonError("Unknown report.", 404);
  const roster = await homeRoster(tenant);
  return NextResponse.json({
    as_of: roster.asOf,
    usable: roster.usable,
    members: roster.members.map((member) => ({ uid: member.uid, name: member.name, rank: normalizeRank(member.rank_label), game_title: rosterTitle(member.rank_label) })),
  }, { headers: { "Cache-Control": "no-store" } });
}
