import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne, withTransaction } from "./db";
import { sendLoginCode } from "./email";
import { logAuthFailure } from "../auth/logging";

export const SESSION_COOKIE = "bf_session";
const SESSION_DAYS = 30;
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;

export interface SessionUser {
  id: string;
  email: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  // Light syntactic check — deliverability is proven by the emailed code.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

/** Creates a 6-digit sign-in code and emails it. Rate limited per address. */
export async function requestLoginCode(rawEmail: string): Promise<{ error?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: "Enter a valid email address." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const created = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`auth-code:${email}`]);
    const { rows: [{ recent }] } = await client.query<{ recent: string }>(
      `select count(*)::text as recent from login_codes
       where email = $1 and created_at > now() - interval '15 minutes'`,
      [email],
    );
    if (Number(recent) >= MAX_CODES_PER_WINDOW) return false;
    await client.query(
      `insert into login_codes (email, code_hash, expires_at)
       values ($1, $2, now() + interval '${CODE_TTL_MINUTES} minutes')`,
      [email, sha256(code)],
    );
    return true;
  });
  if (!created) return { error: "Too many codes requested. Try again in a few minutes." };

  try {
    await sendLoginCode(email, code);
  } catch {
    logAuthFailure("CODE_DELIVERY_FAILED");
    return { error: "The sign-in email could not be sent. Try again shortly." };
  }
  return {};
}

/**
 * Verifies an emailed code, creating the account on first sign-in, and
 * opens a session (sets the httpOnly cookie).
 */
export async function verifyLoginCode(
  rawEmail: string,
  code: string,
): Promise<{ user?: SessionUser; error?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email || !/^\d{6}$/.test(code.trim())) {
    return { error: "Enter the 6-digit code from your email." };
  }

  const result = await withTransaction(async (client) => {
    const { rows: [pending] } = await client.query<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts from login_codes
       where email = $1 and consumed_at is null and expires_at > now()
       order by created_at desc limit 1 for update`,
      [email],
    );
    if (!pending || pending.attempts >= MAX_CODE_ATTEMPTS) {
      return { error: "This code is invalid or expired. Request a new one." };
    }

    const provided = Buffer.from(sha256(code.trim()));
    const expected = Buffer.from(pending.code_hash);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      await client.query(`update login_codes set attempts = attempts + 1 where id = $1`, [pending.id]);
      return { error: "That code didn't match. Check your email and try again." };
    }

    await client.query(`update login_codes set consumed_at = now() where id = $1`, [pending.id]);

    const { rows: [user] } = await client.query<SessionUser>(
      `insert into users (email) values ($1)
       on conflict (email) do update set email = excluded.email
       returning id, email`,
      [email],
    );
    if (!user) return { error: "Account could not be created." };
    return { user };
  });
  if (!result.user) return result;
  await createSession(result.user.id);
  return result;
}

/** All sign-in methods issue the same host-only, 30-day session. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function recentSession(): Promise<{ user: SessionUser; sessionHash: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessionHash = sha256(token);
  const user = await queryOne<SessionUser>(
    `select u.id, u.email from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()
       and s.created_at > now() - interval '10 minutes'`,
    [sessionHash],
  );
  return user ? { user, sessionHash } : null;
}

/** Resolves the signed-in user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return queryOne<SessionUser>(
    `update sessions s set last_seen_at = now()
     from users u
     where s.token_hash = $1 and s.expires_at > now() and u.id = s.user_id
     returning u.id, u.email`,
    [sha256(token)],
  );
}

/** Ends the current session and clears the cookie. */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`delete from sessions where token_hash = $1`, [sha256(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}
