import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return jsonError("This invitation is invalid or expired.", 404);
  }

  const result = await withTransaction(async (client) => {
    const invitation = await client.query<{ id: string }>(
      `select id from command_invitations
       where token_hash = $1 and revoked_at is null and redeemed_at is null
         and expires_at > now()
       for update`,
      [hashToken(token)],
    );
    if (!invitation.rows[0]) return false;
    await client.query(
      `update command_invitations set opened_at = coalesce(opened_at, now())
       where id = $1`,
      [invitation.rows[0].id],
    );
    return true;
  });

  if (!result) return jsonError("This invitation is invalid or expired.", 404);
  return NextResponse.json({ valid: true });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) return jsonError("Sign in with the invited email address to continue.", 401);

  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return jsonError("This invitation is invalid or expired.", 404);
  }
  const body = await request.json().catch(() => null);
  const inGameName =
    typeof body?.in_game_name === "string" ? body.in_game_name.trim() : "";
  if (inGameName.length < 1 || inGameName.length > 40) {
    return jsonError("In-game name must be between 1 and 40 characters.");
  }

  const result = await withTransaction(async (client) => {
    const invitationResult = await client.query<{
      id: string;
      email: string;
      created_by: string;
    }>(
      `select id, email, created_by from command_invitations
       where token_hash = $1 and revoked_at is null and redeemed_at is null
         and expires_at > now()
       for update`,
      [hashToken(token)],
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) return { error: "This invitation is invalid or expired.", status: 404 };
    if (user.email.toLowerCase() !== invitation.email) {
      return {
        error: "Sign in with the email address that received this invitation.",
        status: 403,
      };
    }

    const existingMembership = await client.query(
      `select 1 from alliance_members where user_id = $1`,
      [user.id],
    );
    if (existingMembership.rowCount) {
      return {
        error: "This account already has an alliance membership.",
        status: 409,
      };
    }

    const existingProfile = await client.query<{ alliance: string | null }>(
      `select alliance from profiles where id = $1`,
      [user.id],
    );
    if (existingProfile.rows[0]?.alliance && existingProfile.rows[0].alliance !== "burnfire") {
      return {
        error: "This account already has a profile in another alliance.",
        status: 409,
      };
    }

    if (!existingProfile.rows[0]) {
      await client.query(
        `insert into profiles (id, alliance, in_game_name, display_name)
         values ($1, 'burnfire', $2, $2)`,
        [user.id, inGameName],
      );
    } else {
      await client.query(
        `update profiles set alliance = 'burnfire', in_game_name = $2,
           name_changed_at = case when in_game_name is distinct from $2 then now() else name_changed_at end
         where id = $1`,
        [user.id, inGameName],
      );
    }
    await client.query(
      `insert into alliance_members (alliance, user_id, permission_role, game_rank)
       values ('burnfire', $1, 'member', 'r1')`,
      [user.id],
    );
    await client.query(
      `insert into academy_enrollments (user_id, invitation_id, assigned_officer)
       values ($1, $2, $3) on conflict (user_id) do update set
         invitation_id = excluded.invitation_id, assigned_officer = excluded.assigned_officer`,
      [user.id, invitation.id, invitation.created_by],
    );
    await client.query(
      `update command_invitations set redeemed_by = $1, redeemed_at = now()
       where id = $2`,
      [user.id, invitation.id],
    );
    return { success: true };
  });

  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json({ enrolled: true });
}
