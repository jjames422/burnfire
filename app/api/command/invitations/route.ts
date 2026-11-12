import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { portalOrigin } from "@/config/portal";
import { canManageLeadership, requireCommandOfficer } from "@/lib/server/command";
import { query, withTransaction } from "@/lib/server/db";
import { sendRecruitInvitation } from "@/lib/server/email";
import { jsonError } from "@/lib/server/http";
import { decryptEmail, emailIndex, encryptEmail, maskEmail } from "@/lib/server/email-privacy";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET() {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  const creatorFilter = canManageLeadership(officer) ? "" : "and created_by = $1";
  const rows = await query<{ email_encrypted: string } & Record<string, unknown>>(
    `select id, email_encrypted, created_at, expires_at, opened_at, redeemed_at,
            case
              when redeemed_at is not null then 'redeemed'
              when revoked_at is not null then 'revoked'
              when expires_at <= now() then 'expired'
              else 'pending'
            end as status
     from command_invitations
     where created_at > now() - interval '90 days' ${creatorFilter}
     order by created_at desc
     limit 100`,
    canManageLeadership(officer) ? [] : [user.id],
  );
  // Only a masked hint (e.g. "f•••@gmail.com") ever leaves the server.
  const invitations = rows.map(({ email_encrypted, ...row }) => ({
    ...row,
    email: maskEmail(decryptEmail(email_encrypted)),
  }));
  return NextResponse.json({ invitations });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCommandOfficer();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonError("Enter a valid recruit email address.");
  }

  const token = randomBytes(32).toString("base64url");
  const emailHash = emailIndex(email);
  const invitation = await withTransaction(async (client) => {
    await client.query(
      `update command_invitations set revoked_at = now()
       where email_hash = $1 and redeemed_at is null and revoked_at is null`,
      [emailHash],
    );
    const result = await client.query<{
      id: string;
      expires_at: string;
    }>(
      `insert into command_invitations (email_hash, email_encrypted, token_hash, created_by)
       values ($1, $2, $3, $4)
       returning id, expires_at`,
      [emailHash, encryptEmail(email), hashToken(token), user.id],
    );
    return result.rows[0];
  });

  const isLocal = process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname);
  const baseUrl = isLocal ? request.nextUrl.origin : portalOrigin;
  const invitationUrl = new URL(
    `/academy/invite/${encodeURIComponent(token)}`,
    baseUrl,
  ).toString();

  let emailSent = false;
  let emailError: string | null = null;
  try {
    emailSent = await sendRecruitInvitation(email, invitationUrl);
  } catch (error) {
    console.error("[command] recruit invitation email failed:", error);
    emailError = "Email delivery failed. Copy the invitation link and share it directly.";
  }

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: maskEmail(email),
      expires_at: invitation.expires_at,
      invitation_url: invitationUrl,
      email_sent: emailSent,
      email_error: emailError,
    },
  });
}
