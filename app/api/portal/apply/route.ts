import { NextResponse, type NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/server/http";
import { withTransaction } from "@/lib/server/db";
import { isAllianceRank } from "@/lib/command/member-policy";
import { validTitleForRank } from "@/lib/identity";

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
