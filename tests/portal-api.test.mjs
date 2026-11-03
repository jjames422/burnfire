import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { get as httpGet } from "node:http";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;
const baseUrl = process.env.BURNFIRE_API_TEST_URL;

test("portal APIs preserve one identity across approval, academy, chat, demotion, and sign-in methods", {
  skip: !connectionString || !baseUrl,
}, async () => {
  const database = new URL(connectionString);
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.equal(database.port, "5433");
  assert.equal(database.pathname, "/burnfire");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const client = new pg.Client({ connectionString });
  const suffix = randomBytes(8).toString("hex");
  const emails = [`portal-member-${suffix}@example.invalid`, `portal-admin-${suffix}@example.invalid`];
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  await client.connect();
  async function request(path, method = "GET", cookie = "", body) {
    const response = await fetch(new URL(path, origin), {
      method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return { response, data };
  }
  async function signIn(email, name) {
    await client.query("insert into login_codes (email, code_hash, expires_at) values ($1,$2,now()+interval '2 minutes')", [email, hash("164829")]);
    const { response, data } = await request("/api/auth/verify", "POST", "", { email, code: "164829" });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().find((value) => value.startsWith("bf_session="))?.split(";")[0];
    assert.ok(cookie);
    const profile = await request("/api/profile", "POST", cookie, { in_game_name: name });
    assert.equal(profile.response.status, 200);
    return { id: data.user.id, cookie };
  }
  try {
    const portalHost = new URL(process.env.PORTAL_URL ?? process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.burnfire2.com").host;
    const rootTitle = await new Promise((resolve, reject) => {
      httpGet(origin, { headers: { Host: portalHost } }, (response) => {
        let html = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { html += chunk; });
        response.on("end", () => resolve(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""));
        response.on("error", reject);
      }).on("error", reject);
    });
    assert.match(rootTitle, /^Member Portal/);
    const member = await signIn(emails[0], "Portal test applicant");
    const admin = await signIn(emails[1], "Portal test administrator");
    await client.query("insert into platform_admins (user_id) values ($1)", [admin.id]);
    await client.query("insert into alliance_members (alliance,user_id,game_rank,verified_at) values ('burnfire',$1,'r4',now())", [admin.id]);

    assert.equal((await request("/api/portal/apply", "POST", member.cookie, { game_identifier: "TEST-PLAYER-ID" })).response.status, 200);
    assert.equal((await request("/api/academy", "GET", member.cookie)).response.status, 200);
    assert.equal((await request("/api/command/overview", "GET", member.cookie)).response.status, 403);
    const pending = await request("/api/channels", "GET", member.cookie);
    assert.equal(pending.data.channels.some((channel) => channel.scope === "alliance"), false);
    const invitationToken = randomBytes(32).toString("base64url");
    await client.query("insert into command_invitations (email,token_hash,created_by) values ($1,$2,$3)", [emails[0], hash(invitationToken), admin.id]);
    const redeemed = await request(`/api/academy/invitations/${invitationToken}`, "POST", member.cookie, { in_game_name: "Portal test applicant" });
    assert.equal(redeemed.response.status, 200, "Existing applicant enrollment is preserved when a personal invitation is redeemed");
    assert.equal((await request(`/api/academy/invitations/${invitationToken}`, "POST", member.cookie, { in_game_name: "Portal test applicant" })).response.status, 404);
    assert.equal((await request("/api/command/members", "GET", admin.cookie)).response.status, 200);
    const approved = await request("/api/command/members", "PATCH", admin.cookie, { user_id: member.id, game_rank: "r3" });
    assert.equal(approved.response.status, 200);
    assert.equal((await request("/api/command/overview", "GET", member.cookie)).response.status, 200);
    assert.equal((await request("/api/command/content", "GET", member.cookie)).response.status, 403);
    assert.equal((await request("/api/command/members", "PATCH", member.cookie, { user_id: member.id, game_rank: "r4" })).response.status, 403);

    const options = await request("/api/auth/passkeys/register/options", "POST", admin.cookie, {});
    assert.equal(options.response.status, 200);
    assert.equal(options.data.authenticatorSelection.userVerification, "required");
    assert.equal(options.data.authenticatorSelection.residentKey, "required");
    assert.equal(options.data.rp.id, new URL(origin).hostname);

    await request("/api/command/members", "PATCH", admin.cookie, { user_id: member.id, game_rank: "r2" });
    assert.equal((await request("/api/command/overview", "GET", member.cookie)).response.status, 403, "Demotion works without signing out");
    assert.equal((await request("/api/academy", "GET", member.cookie)).response.status, 200);
    const adminOverview = await request("/api/command/overview", "GET", admin.cookie);
    assert.equal(adminOverview.data.officer_rank, "r4");
    assert.equal(adminOverview.data.is_site_admin, true);
    assert.equal((await request("/api/command/content", "GET", admin.cookie)).response.status, 200);

    const token = randomBytes(32).toString("base64url");
    await client.query("insert into auth_links(token_hash,email,return_to,expires_at) values($1,$2,'/academy',now()+interval '2 minutes')", [hash(token), emails[0]]);
    assert.equal((await fetch(new URL("/api/auth/consume-link", origin))).status, 405, "GET cannot consume a sign-in link");
    const consumed = await request("/api/auth/consume-link", "POST", "", { token });
    assert.equal(consumed.response.status, 200);
    assert.equal(consumed.data.returnTo, "/academy");
    assert.equal((await request("/api/auth/consume-link", "POST", "", { token })).response.status, 400, "A sign-in link is single-use");
    const rejected = await fetch(new URL("/api/auth/passkeys/authenticate/options", origin), { method: "POST", headers: { Origin: "https://example.invalid", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(rejected.status, 403);
  } finally {
    await client.query("delete from command_invitations where email = any($1::text[])", [emails]);
    await client.query("delete from auth_links where email = any($1::text[])", [emails]);
    await client.query("delete from login_codes where email = any($1::text[])", [emails]);
    await client.query("delete from users where email = any($1::text[])", [emails]);
    await client.end();
  }
});
