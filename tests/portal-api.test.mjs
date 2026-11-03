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
  const emails = ["member", "admin", "officer", "leader-request", "incomplete"].map((kind) => `portal-${kind}-${suffix}@example.invalid`);
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
    const officer = await signIn(emails[2], "Portal test officer");
    await client.query("insert into alliance_members (alliance,user_id,game_rank,verified_at) values ('burnfire',$1,'r4',now())", [officer.id]);
    const incomplete = await client.query("insert into users (email) values ($1) returning id", [emails[4]]);
    const initialTasks = await request("/api/portal", "GET", admin.cookie);
    assert.ok(initialTasks.data.tasks.some((task) => task.user_id === member.id), "New signups create a task even before requesting rank");
    assert.ok(initialTasks.data.tasks.some((task) => task.user_id === incomplete.rows[0].id), "Incomplete signups are visible to site admins");
    const initialRoster = await request("/api/command/members", "GET", admin.cookie);
    assert.ok(initialRoster.data.members.some((item) => item.id === incomplete.rows[0].id && !item.profile_complete && item.email === emails[4]));
    assert.equal((await request("/api/command/members?page=-1", "GET", admin.cookie)).response.status, 400);
    const officerRoster = await request("/api/command/members", "GET", officer.cookie);
    assert.ok(officerRoster.data.members.every((item) => item.email === null && item.requested_rank === null));
    assert.equal(officerRoster.data.members.some((item) => item.id === incomplete.rows[0].id), false);
    const privateTasks = await request("/api/portal", "GET", officer.cookie);
    assert.deepEqual(privateTasks.data.tasks, []);
    assert.equal(privateTasks.data.summary, null);

    assert.equal((await request("/api/portal/apply", "POST", member.cookie, { game_identifier: "TEST-PLAYER-ID", requested_rank: "site_admin" })).response.status, 400);
    assert.equal((await request("/api/portal/apply", "POST", member.cookie, { game_identifier: "TEST-PLAYER-ID", requested_rank: "r2", requested_title: "goddess" })).response.status, 400);
    assert.equal((await request("/api/portal/apply", "POST", member.cookie, { game_identifier: "TEST-PLAYER-ID", requested_rank: "r4", requested_title: "goddess" })).response.status, 200);
    assert.equal((await request("/api/portal/apply", "POST", member.cookie, { game_identifier: "TEST-PLAYER-ID", requested_rank: "r5" })).response.status, 409);
    const task = (await request("/api/portal", "GET", admin.cookie)).data.tasks.find((item) => item.user_id === member.id);
    assert.equal(task.requested_rank, "r4");
    assert.equal(task.requested_title, "goddess");
    assert.equal((await request("/api/command/members", "PATCH", officer.cookie, { user_id: member.id, game_rank: "r2" })).response.status, 403, "Officers cannot decide site-admin signup tasks");
    assert.equal((await request("/api/academy", "GET", member.cookie)).response.status, 200);
    await client.query("update academy_enrollments set game_identifier = null, current_step = 16 where user_id = $1", [member.id]);
    const mandatoryIdentity = await request("/api/academy", "GET", member.cookie);
    assert.equal(mandatoryIdentity.data.enrollment.current_step, 1, "Previously skipped positions return to mandatory identity");
    const firstSection = mandatoryIdentity.data.content[0];
    assert.equal((await request("/api/academy/step", "PATCH", member.cookie, { current_step: 2 })).response.status, 409);
    assert.equal((await request("/api/academy/identity", "PATCH", member.cookie, { game_identifier: "  " })).response.status, 400);
    assert.equal((await request("/api/academy/quiz", "POST", member.cookie, { slug: firstSection.slug, answers: {} })).response.status, 409);
    assert.equal((await request("/api/academy/acknowledge", "POST", member.cookie, { slug: firstSection.slug })).response.status, 409);
    assert.equal((await request("/api/academy/identity", "PATCH", member.cookie, { game_identifier: "TEST-PLAYER-ID" })).response.status, 200);
    const savedIdentity = await request("/api/academy", "GET", member.cookie);
    assert.equal(savedIdentity.data.enrollment.game_identifier, "TEST-PLAYER-ID", "Saved identity is available when resuming");
    assert.equal((await request("/api/academy/step", "PATCH", member.cookie, { current_step: 2 })).response.status, 200);
    assert.equal((await request("/api/academy/preferences", "PATCH", member.cookie, { communication_preference: "website" })).response.status, 200);
    assert.equal((await request("/api/academy/step", "PATCH", member.cookie, { current_step: 3 })).response.status, 200);
    assert.equal((await request("/api/academy/step", "PATCH", member.cookie, { current_step: 4 })).response.status, 409, "Required sections cannot be skipped");
    assert.equal((await request("/api/academy/progress", "POST", member.cookie, { slug: firstSection.slug, current_step: 16 })).response.status, 409, "Progress endpoint cannot bypass the step gate");
    assert.equal((await request("/api/academy/acknowledge", "POST", member.cookie, { slug: firstSection.slug })).response.status, 409, "Knowledge check must be passed first");
    assert.equal((await request("/api/academy/quiz", "POST", member.cookie, { slug: firstSection.slug, answers: {} })).response.status, 400, "Every quiz question requires an answer");
    const correct = await client.query("select id, correct_index from academy_questions where content_id = $1", [firstSection.id]);
    const answers = Object.fromEntries(correct.rows.map((question) => [question.id, question.correct_index]));
    assert.equal((await request("/api/academy/quiz", "POST", member.cookie, { slug: firstSection.slug, answers })).response.status, 200);
    assert.equal((await request("/api/academy/acknowledge", "POST", member.cookie, { slug: firstSection.slug })).response.status, 200);
    assert.equal((await request("/api/academy/step", "PATCH", member.cookie, { current_step: 4 })).response.status, 200, "Passing and acknowledging unlocks the next section");
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
    assert.equal((await request("/api/portal", "GET", admin.cookie)).data.tasks.some((item) => item.user_id === member.id), false, "Approval clears the admin task");
    const decision = await client.query("select status, approved_rank, reviewed_by from membership_requests where user_id = $1", [member.id]);
    assert.equal(decision.rows[0].status, "approved");
    assert.equal(decision.rows[0].approved_rank, "r3", "Admin can correct a requested higher rank");
    assert.equal(decision.rows[0].reviewed_by, admin.id);
    const unchangedIdentity = await request("/api/academy/identity", "PATCH", member.cookie, { game_identifier: "TEST-PLAYER-ID" });
    assert.equal(unchangedIdentity.response.status, 200);
    assert.equal(unchangedIdentity.data.identity_status, "verified", "Reusing the saved identifier preserves verification");
    assert.equal((await request("/api/command/overview", "GET", member.cookie)).response.status, 200);
    assert.equal((await request("/api/command/content", "GET", member.cookie)).response.status, 403);
    assert.equal((await request("/api/command/members", "PATCH", member.cookie, { user_id: member.id, game_rank: "r4" })).response.status, 403);
    assert.equal((await request("/api/command/members", "PATCH", admin.cookie, { user_id: member.id, game_rank: "r3", alliance_title: "goddess" })).response.status, 400);
    assert.equal((await request("/api/command/members", "PATCH", admin.cookie, { user_id: member.id, game_rank: "r4", alliance_title: "goddess" })).response.status, 200);
    const appointed = await client.query("select game_rank, alliance_title from alliance_members where user_id = $1", [member.id]);
    assert.equal(appointed.rows[0].game_rank, "r4");
    assert.equal(appointed.rows[0].alliance_title, "goddess");
    const leaderRequest = await signIn(emails[3], "Portal test leader request");
    assert.equal((await request("/api/portal/apply", "POST", leaderRequest.cookie, { game_identifier: "TEST-LEADER-ID", requested_rank: "r5" })).response.status, 200);
    const leaderTask = (await request("/api/portal", "GET", admin.cookie)).data.tasks.find((item) => item.user_id === leaderRequest.id);
    assert.equal(leaderTask.requested_title, "alliance_leader");
    assert.equal((await request("/api/command/overview", "GET", leaderRequest.cookie)).response.status, 403, "Requesting R5 never grants leadership");
    assert.equal((await request("/api/command/members", "PATCH", admin.cookie, { user_id: leaderRequest.id, game_rank: "r1" })).response.status, 200);

    const options = await request("/api/auth/passkeys/register/options", "POST", admin.cookie, {});
    assert.equal(options.response.status, 200);
    assert.equal(options.data.authenticatorSelection.userVerification, "required");
    assert.equal(options.data.authenticatorSelection.residentKey, "required");
    assert.equal(options.data.authenticatorSelection.authenticatorAttachment, "platform");
    assert.deepEqual(options.data.hints, ["client-device"]);
    assert.equal(options.data.rp.id, new URL(origin).hostname);
    const authentication = await request("/api/auth/passkeys/authenticate/options", "POST", "", {});
    assert.equal(authentication.response.status, 200);
    assert.deepEqual(authentication.data.hints, ["client-device"]);

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
