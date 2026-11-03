import { configuredPortalOrigin, hashAuthToken, newAuthToken, safeReturnTo, validAuthToken } from "../auth/security";
import { createSession, normalizeEmail, type SessionUser } from "./auth";
import { query, queryOne, withTransaction } from "./db";
import { sendLoginLink } from "./email";
import { logAuthFailure } from "../auth/logging";

export async function requestLoginLink(rawEmail: string, returnTo: unknown, origin?: string): Promise<{ error?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: "Enter a valid email address." };
  const token = newAuthToken();
  const tokenHash = hashAuthToken(token);
  const created = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`auth-link:${email}`]);
    const { rows: [count] } = await client.query<{ recent: string }>(
      `select count(*)::text as recent from auth_links where email = $1 and created_at > now() - interval '15 minutes'`, [email],
    );
    if (Number(count.recent) >= 5) return false;
    await client.query(
      `insert into auth_links(token_hash, email, return_to, expires_at) values ($1,$2,$3,now() + interval '10 minutes')`,
      [tokenHash, email, safeReturnTo(returnTo)],
    );
    return true;
  });
  if (!created) return { error: "Too many sign-in emails requested. Try again in a few minutes." };
  const url = new URL("/auth/link", origin ?? configuredPortalOrigin());
  url.hash = new URLSearchParams({ token }).toString();
  try {
    await sendLoginLink(email, url.toString());
  } catch {
    logAuthFailure("LINK_DELIVERY_FAILED");
    // Retain the row for rate limiting, but make an undelivered token unusable.
    await query("update auth_links set expires_at = now() where token_hash = $1", [tokenHash]);
    return { error: "The sign-in email could not be sent. Try an email code or try again later." };
  }
  return {};
}

export async function consumeLoginLink(token: unknown): Promise<{ returnTo?: string; error?: string }> {
  if (!validAuthToken(token)) return { error: "This sign-in link is invalid or expired. Request a new one." };
  const link = await queryOne<{ email: string; return_to: string }>(
    `delete from auth_links where token_hash = $1 and expires_at > now() returning email, return_to`,
    [hashAuthToken(token)],
  );
  if (!link) return { error: "This sign-in link was already used or expired. Request a new one." };
  const user = await queryOne<SessionUser>(
    `insert into users(email) values ($1) on conflict(email) do update set email = excluded.email returning id,email`,
    [link.email],
  );
  if (!user) return { error: "Sign-in could not be completed. Request a new link." };
  await createSession(user.id);
  return { returnTo: safeReturnTo(link.return_to) };
}
