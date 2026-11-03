import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { requireUser } from "@/lib/server/http";
import type {
  AccountPayload,
  AllianceInvitationRow,
  NotificationRow,
} from "@/lib/api/types";

/** Inbox data: notifications, pending invitations, membership, identity. */
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const [notifications, invitations, membership, identity] = await Promise.all([
    query<NotificationRow>(
      `select * from notifications where user_id = $1
       order by created_at desc limit 30`,
      [user.id],
    ),
    query<AllianceInvitationRow>(
      `select * from alliance_invitations
       where invitee_id = $1 and status = 'pending'`,
      [user.id],
    ),
    queryOne<{ alliance: string }>(
      `select alliance from alliance_members where user_id = $1`,
      [user.id],
    ),
    queryOne<{ get_my_chat_identity: string }>(
      `select get_my_chat_identity($1)`,
      [user.id],
    ),
  ]);

  const payload: AccountPayload = {
    email: user.email,
    identity_label: identity?.get_my_chat_identity ?? "A survivor",
    has_alliance: Boolean(membership),
    notifications,
    invitations,
  };
  return NextResponse.json(payload);
}
