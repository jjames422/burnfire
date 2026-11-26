import { NextResponse, type NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/server/http";
import { withTransaction } from "@/lib/server/db";
import { isAllianceRank } from "@/lib/command/member-policy";
import { validTitleForRank } from "@/lib/identity";
import { matchRoster } from "@/lib/intel/roster-match.ts";
import { homeRoster } from "@/lib/server/roster";
import { queryOne } from "@/lib/server/db";

// Checked against the synced game roster before an officer ever sees the request.
const ROSTER_ERRORS = {
  not_found: "That player ID or name is not in BurnFire's current game roster. Check it and try again.",
  ambiguous: "More than one roster member has that name. Enter your numeric player ID instead.",
  name: "The in-game name on your profile does not match the game for this player. Update your profile name to match the game exactly.",
  rank: "The rank you selected does not match your in-game rank. Choose the rank the game shows.",
};

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.game_identifier === "string" ? body.game_identifier.trim() : "";
  if (identifier.length < 2 || identifier.length > 80) return jsonError("Enter your game identifier (2-80 characters).");
  const rank = body?.requested_rank;
  const title = rank === "r5" ? "alliance_leader" : body?.requested_title ?? null;
  if (!isAllianceRank(rank) || !validTitleForRank(rank, title)) {
    return jsonError("Choose your in-game rank and a valid title for that rank.");
  }

  // Roster check: blocks typos and wrong ranks unless the applicant asks for
  // officer review (for example, promoted or recruited within the last hour).
  const reviewRequested = body?.request_review === true;
  const roster = await homeRoster("burnfire");
  if (roster.usable && !reviewRequested) {
    const profile = await queryOne<{ in_game_name: string }>("select in_game_name from profiles where id = $1", [user.id]);
    const check = matchRoster(roster.members, { identifier, name: profile?.in_game_name ?? null, rank });
    const problem = check.status === "not_found" ? ROSTER_ERRORS.not_found
      : check.status === "ambiguous" ? ROSTER_ERRORS.ambiguous
      : check.checks.name === false ? ROSTER_ERRORS.name
      : check.checks.rank === false ? ROSTER_ERRORS.rank : null;
    if (problem) {
      return NextResponse.json({
        error: problem,
        roster_check: { status: check.status, roster_name: check.entry?.name ?? null, roster_rank: check.rosterRank, as_of: roster.asOf },
      }, { status: 422 });
    }
  }

  const result = await withTransaction(async (client) => {
    const profile = await client.query("select id from profiles where id = $1 for update", [user.id]);
    if (!profile.rowCount) return { error: "Complete your player profile first.", status: 409 };
    const membership = await client.query("select alliance, verified_at from alliance_members where user_id = $1", [user.id]);
    if (membership.rows[0] && membership.rows[0].alliance !== "burnfire") {
      return { error: "Your account already belongs to another alliance.", status: 409 };
    }
    if (membership.rows[0]?.verified_at) return { error: "Your membership is already approved. Contact a site administrator to change your rank.", status: 409 };
    const existing = await client.query("select 1 from membership_requests where user_id = $1", [user.id]);
    if (existing.rowCount) return { error: "Your membership request has already been submitted. A site administrator can review or change it.", status: 409 };
    const enrollment = await client.query<{ game_identifier: string | null }>(
      "select game_identifier from academy_enrollments where user_id = $1 for update", [user.id],
    );
    if (enrollment.rows[0]?.game_identifier?.trim() && enrollment.rows[0].game_identifier !== identifier) {
      return { error: "Update your saved game identifier in the academy before requesting a rank.", status: 409 };
    }
    await client.query(
      `insert into academy_enrollments (user_id, game_identifier)
       values ($1, $2) on conflict (user_id) do update set
         game_identifier = excluded.game_identifier`,
      [user.id, identifier],
    );
    await client.query(
      `insert into membership_requests (user_id, requested_rank, requested_title)
       values ($1, $2, $3)`,
      [user.id, rank, title],
    );
    return { enrolled: true, approval_pending: true };
  });
  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
