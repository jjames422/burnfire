import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { ACCOUNT_HINT_COOKIE, accountHintOptions } from "../lib/auth/account-hint.ts";

const baseUrl = process.env.BURNFIRE_API_TEST_URL;
const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;

test("account hints contain no identity and share only the BurnFire domain", () => {
  assert.equal(ACCOUNT_HINT_COOKIE, "bf_account_known");
  for (const hostname of ["burnfire2.com", "www.burnfire2.com", "portal.burnfire2.com"]) {
    assert.deepEqual(accountHintOptions(hostname, true), {
      httpOnly: true, sameSite: "lax", secure: true, path: "/",
      maxAge: 31536000, domain: "burnfire2.com",
    });
  }
  for (const hostname of ["localhost", "127.0.0.1", "burnfire2.com.example.invalid", "notburnfire2.com", ""]) {
    assert.equal(accountHintOptions(hostname, false).domain, undefined, hostname);
    assert.equal(accountHintOptions(hostname, false).secure, false);
  }
});

async function publicHeader(cookie = "") {
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const response = await fetch(origin, { headers: { Cookie: cookie, "Accept-Language": "en" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  const header = html.match(/<header class="public-header">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header, "Public header is server rendered");
  return header;
}

test("new visitors see registration; remembered browsers only see sign-in", { skip: !baseUrl }, async () => {
  const fresh = await publicHeader();
  assert.match(fresh, /href="\/portal"[^>]*>[\s\S]*?Sign in/);
  assert.match(fresh, /href="\/portal\?signup=1"/);
  assert.match(fresh, /Create account/);
  for (const cookie of ["bf_account_known=1", "bf_account_known=1; bf_session=expired"]) {
    const known = await publicHeader(cookie);
    assert.match(known, /Sign in/);
    assert.doesNotMatch(known, /Create account|Enter member portal/);
    assert.doesNotMatch(known, /href="\/portal\?signup=1"/);
  }
  assert.match(await publicHeader("bf_account_known=invalid"), /Create account/);
});

test("verified accounts receive the hint, existing sessions backfill it, and sign-out preserves it", {
  skip: !baseUrl || !connectionString,
}, async () => {
  const origin = new URL(baseUrl).origin;
  const database = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.equal(database.port, "5433");
  assert.equal(database.pathname, "/burnfire");
  const client = new pg.Client({ connectionString });
  const email = `header-test-${randomBytes(8).toString("hex")}@example.invalid`;
  const code = "164829";
  await client.connect();
  try {
    await client.query("insert into login_codes (email, code_hash, expires_at) values ($1,$2,now()+interval '2 minutes')",
      [email, createHash("sha256").update(code).digest("hex")]);
    const verified = await fetch(new URL("/api/auth/verify", origin), {
      method: "POST", headers: { Origin: "https://burnfire2.com", "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    assert.equal(verified.status, 200);
    const setCookies = verified.headers.getSetCookie();
    const sessionCookie = setCookies.find((value) => value.startsWith("bf_session="));
    const hintCookie = setCookies.find((value) => value.startsWith("bf_account_known="));
    assert.ok(sessionCookie);
    assert.match(hintCookie, /^bf_account_known=1;/);
    assert.match(hintCookie, /HttpOnly/i);
    assert.doesNotMatch(sessionCookie, /Domain=/i, "Authentication stays host-only");
    const cookie = sessionCookie.split(";")[0];
    const signedIn = await publicHeader(cookie);
    assert.match(signedIn, /Enter member portal/);
    assert.doesNotMatch(signedIn, /Create account|Sign in/);
    const session = await fetch(new URL("/api/auth/session", origin), { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.ok(session.headers.getSetCookie().some((value) => value.startsWith("bf_account_known=1;")));
    const signout = await fetch(new URL("/api/auth/signout", origin), {
      method: "POST", headers: { Origin: "https://burnfire2.com", Cookie: `${cookie}; bf_account_known=1` },
    });
    assert.equal(signout.status, 200);
    assert.ok(signout.headers.getSetCookie().some((value) => value.startsWith("bf_session=;")));
    assert.ok(signout.headers.getSetCookie().every((value) => !value.startsWith("bf_account_known=")));
    const signedOut = await publicHeader(`${cookie}; bf_account_known=1`);
    assert.match(signedOut, /Sign in/);
    assert.doesNotMatch(signedOut, /Create account|Enter member portal/);
  } finally {
    await client.query("delete from users where email = $1", [email]);
    await client.query("delete from login_codes where email = $1", [email]);
    await client.end();
  }
});
