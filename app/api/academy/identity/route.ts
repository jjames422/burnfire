import { NextResponse, type NextRequest } from "next/server";
import { withTransaction } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const gameIdentifier =
    typeof body?.game_identifier === "string" ? body.game_identifier.trim() : "";
  if (gameIdentifier.length < 2 || gameIdentifier.length > 80) {
    return jsonError("Enter a game identifier between 2 and 80 characters.");
  }

  const found = await withTransaction(async (client) => {
    const enrollment = await client.query<{ identity_status: string }>(
      `select identity_status from academy_enrollments where user_id = $1 for update`,
      [user.id],
    );
    const current = enrollment.rows[0];
    if (!current) return false;
    await client.query(
      `update academy_enrollments set game_identifier = $2, identity_status = 'pending',
         identity_verified_by = null, identity_verified_at = null
       where user_id = $1`,
      [user.id, gameIdentifier],
    );
    if (current.identity_status !== "pending") {
      await client.query(
        `insert into academy_identity_history
           (user_id, changed_by, previous_status, new_status, note)
         values ($1, $1, $2, 'pending', 'Member submitted an updated game identifier.')`,
        [user.id, current.identity_status],
      );
    }
    await client.query(
      `update alliance_members set verified_at = null, verified_by = null
       where user_id = $1 and alliance = 'burnfire'`,
      [user.id],
    );
    return true;
  });
  if (!found) return jsonError("Redeem a BF2 recruit invitation to continue.", 403);
  return NextResponse.json({ submitted: true, identity_status: "pending" });
}
