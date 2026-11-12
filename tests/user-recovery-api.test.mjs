import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { emailIndex, storedEmail } from "./email-fixtures.mjs";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;
const baseUrl = process.env.BURNFIRE_API_TEST_URL;

test("site-admin account support resets only the chosen user and records each confirmed action", {
  skip: !connectionString || !baseUrl,
}, async () => {
  const database = new URL(connectionString);
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.equal(database.port, "5433");
  assert.equal(database.pathname, "/burnfire");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const client = new pg.Client({ connectionString });
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const suffix = randomBytes(8).toString("hex");
  const users = [];
  await client.connect();
  async function account(label, rank, siteAdmin = false) {
    const email = `support-${label}-${suffix}@example.invalid`;
    const { rows: [user] } = await client.query("insert into users (email_hash, email_encrypted) values ($1, $2) returning id", storedEmail(email));
    users.push(user.id);
    if (rank) {
      await client.query("insert into profiles (id,in_game_name) values ($1,$2)", [user.id, `Support ${label}`]);
      if (siteAdmin) await client.query("insert into platform_admins (user_id) values ($1)", [user.id]);
      await client.query("insert into alliance_members (user_id,alliance,game_rank,verified_at) values ($1,'burnfire',$2,now())", [user.id, rank]);
    }
    const token = randomBytes(32).toString("base64url");
    const sessionHash = hash(token);
    await client.query("insert into sessions (user_id,token_hash,expires_at) values ($1,$2,now()+interval '1 day')", [user.id, sessionHash]);
    return { ...user, email, cookie: `bf_session=${token}`, sessionHash };
  }
  async function request(path, method = "GET", cookie = "", body) {
    const response = await fetch(new URL(path, origin), {
      method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    const admin = await account("admin", "r4", true);
    const officer = await account("officer", "r4");
    const target = await account("target", "r3");
    const incomplete = await account("incomplete");
    const endpoint = `/api/command/members/${target.id}/recovery`;
    const actionBody = (action, extra = {}) => ({ action, reason: "Requested account support", confirmed: true, ...extra });
    const perform = (action, extra) => request(endpoint, "POST", admin.cookie, actionBody(action, extra));

    assert.equal((await request(endpoint)).status, 401);
    assert.equal((await request(endpoint, "GET", officer.cookie)).status, 403);
    assert.equal((await request(endpoint, "GET", target.cookie)).status, 403);
    for (const action of ["academy_reset", "resolve_followups", "revoke_sessions", "remove_passkeys", "reset_identity"]) {
      assert.equal((await request(endpoint, "POST", officer.cookie, actionBody(action))).status, 403);
    }
    assert.equal((await request(`/api/command/members/${randomUUID()}/recovery`, "GET", admin.cookie)).status, 404);
    assert.equal((await perform("academy_reset", { confirmed: false })).status, 400);
    assert.equal((await perform("academy_reset", { reason: " " })).status, 400);
    assert.equal((await perform("delete_account")).status, 400);
    const byEmail = await request(`/api/command/members?q=${encodeURIComponent(incomplete.email)}`, "GET", admin.cookie);
    assert.equal(byEmail.data.members.length, 1);
    assert.equal(byEmail.data.members[0].id, incomplete.id);
    const incompleteEndpoint = `/api/command/members/${incomplete.id}/recovery`;
    assert.equal((await request(incompleteEndpoint, "GET", admin.cookie)).status, 200);
    assert.equal((await request(incompleteEndpoint, "POST", admin.cookie, actionBody("academy_reset"))).status, 409);

    const { rows: [content] } = await client.query("select id from academy_content where status='published' and content_type='rule' order by slug limit 1");
    await client.query(
      `update academy_enrollments set game_identifier='SUPPORT-ID', communication_preference='website',
       identity_status='verified',identity_verified_by=$2,identity_verified_at=now(),
       current_step=5,completed_at=now(),alliance_mail_help=true where user_id=$1`, [target.id, admin.id],
    );
    await client.query("insert into academy_quiz_attempts (user_id,content_id,answers,correct_count,question_count,passed) values ($1,$2,'{}',1,1,true)", [target.id, content.id]);
    await client.query("insert into academy_acknowledgments (user_id,content_id) values ($1,$2)", [target.id, content.id]);
    await client.query("insert into academy_progress (user_id,content_id,status,completed_at) values ($1,$2,'completed',now())", [target.id, content.id]);
    const { rows: [issue] } = await client.query(
      `insert into command_followups (user_id,issue_key,content_id,reason,officer_notes,assigned_to)
       values ($1,'help:alliance-mail',$2,'Needs help','Keep these notes',$3) returning id`, [target.id, content.id, officer.id],
    );
    const { rows: [otherIssue] } = await client.query(
      "insert into command_followups (user_id,issue_key,reason) values ($1,'support:other','Unrelated issue') returning id", [officer.id],
    );
    const reset = await perform("academy_reset");
    assert.equal(reset.status, 200);
    assert.equal(reset.data.details.quiz_attempts, 1);
    assert.equal(reset.data.details.acknowledgments, 1);
    assert.equal(reset.data.details.progress, 1);
    const { rows: [saved] } = await client.query(
      `select e.*,am.game_rank,am.verified_at from academy_enrollments e join alliance_members am on am.user_id=e.user_id where e.user_id=$1`, [target.id],
    );
    assert.equal(saved.current_step, 0);
    assert.equal(saved.completed_at, null);
    assert.equal(saved.game_identifier, "SUPPORT-ID");
    assert.equal(saved.communication_preference, "website");
    assert.equal(saved.identity_status, "verified");
    assert.equal(saved.game_rank, "r3");
    assert.ok(saved.verified_at);
    const empty = await request(endpoint, "GET", admin.cookie);
    assert.equal(empty.data.user.quiz_attempts, 0);
    assert.equal(empty.data.user.acknowledgments, 0);
    assert.equal(empty.data.followups.length, 1);
    assert.equal((await request("/api/command/overview", "GET", target.cookie)).status, 200);

    assert.equal((await perform("resolve_followups", { followup_ids: [] })).status, 400);
    assert.equal((await perform("resolve_followups", { followup_ids: [issue.id, issue.id] })).status, 400);
    assert.equal((await perform("resolve_followups", { followup_ids: [issue.id, otherIssue.id] })).status, 409);
    const { rows: [unchanged] } = await client.query("select status from command_followups where id=$1", [issue.id]);
    assert.equal(unchanged.status, "open", "Mixed-user selection must not partially resolve issues");
    await client.query("insert into academy_progress (user_id,content_id,status,needs_assistance) values ($1,$2,'needs_assistance',true)", [target.id, content.id]);
    assert.equal((await perform("resolve_followups", { followup_ids: [issue.id] })).status, 200);
    assert.equal((await perform("resolve_followups", { followup_ids: [issue.id] })).status, 409);
    const { rows: [resolved] } = await client.query("select status,officer_notes,assigned_to,resolved_at from command_followups where id=$1", [issue.id]);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.officer_notes, "Keep these notes");
    assert.equal(resolved.assigned_to, officer.id);
    assert.ok(resolved.resolved_at);
    const { rows: [history] } = await client.query("select previous_status,editor_id from command_followup_history where followup_id=$1", [issue.id]);
    assert.equal(history.previous_status, "open");
    assert.equal(history.editor_id, admin.id);
    const { rows: [assistance] } = await client.query("select p.needs_assistance,e.alliance_mail_help from academy_progress p join academy_enrollments e on e.user_id=p.user_id where p.user_id=$1", [target.id]);
    assert.equal(assistance.needs_assistance, false);
    assert.equal(assistance.alliance_mail_help, false);
    assert.equal((await request("/api/command/followups", "PATCH", officer.cookie, { id: otherIssue.id, status: "resolved" })).status, 200, "Existing follow-up workflow still works");

    const credentialId = `support-${suffix}`;
    await client.query(
      `insert into passkeys (credential_id,user_id,public_key,counter,device_type,backed_up)
       values ($1,$2,$3,0,'singleDevice',false)`, [credentialId, target.id, Buffer.from("test-public-key")],
    );
    await client.query(
      "insert into auth_challenges (token_hash,challenge,purpose,user_id,session_hash,expires_at) values ($1,'test','registration',$2,$3,now()+interval '5 minutes')",
      [hash(`challenge-${suffix}`), target.id, target.sessionHash],
    );
    assert.equal((await perform("remove_passkeys")).status, 200);
    const { rows: [credentials] } = await client.query("select (select count(*)::int from passkeys where user_id=$1) as keys,(select count(*)::int from auth_challenges where user_id=$1) as challenges", [target.id]);
    assert.equal(credentials.keys, 0);
    assert.equal(credentials.challenges, 0);
    assert.equal((await request("/api/auth/session", "GET", target.cookie)).data.user.id, target.id, "Removing passkeys does not revoke sessions");

    assert.equal((await perform("reset_identity")).status, 200);
    const { rows: [identity] } = await client.query("select e.identity_status,e.game_identifier,am.game_rank,am.verified_at from academy_enrollments e join alliance_members am on am.user_id=e.user_id where e.user_id=$1", [target.id]);
    assert.equal(identity.identity_status, "pending");
    assert.equal(identity.game_identifier, "SUPPORT-ID");
    assert.equal(identity.game_rank, "r3");
    assert.equal(identity.verified_at, null);
    assert.equal((await request("/api/command/overview", "GET", target.cookie)).status, 403);

    await client.query("insert into sessions (user_id,token_hash,expires_at) values ($1,$2,now()+interval '1 day')", [target.id, hash(`second-${suffix}`)]);
    const revoked = await perform("revoke_sessions");
    assert.equal(revoked.status, 200);
    assert.equal(revoked.data.details.sessions, 2);
    assert.equal((await request("/api/auth/session", "GET", target.cookie)).data.user, null);
    assert.equal((await request("/api/auth/session", "GET", officer.cookie)).data.user.id, officer.id);
    await client.query("insert into login_codes (email_hash,code_hash,expires_at) values ($1,$2,now()+interval '2 minutes')", [emailIndex(target.email), hash("164829")]);
    assert.equal((await request("/api/auth/verify", "POST", "", { email: target.email, code: "164829" })).status, 200, "Email recovery remains available");
    const audit = await request(endpoint, "GET", admin.cookie);
    assert.equal(audit.data.history.length, 5, "Only successful actions create audit entries");
    assert.deepEqual(new Set(audit.data.history.map((entry) => entry.action)), new Set(["academy_reset", "resolve_followups", "remove_passkeys", "reset_identity", "revoke_sessions"]));
    assert.ok(audit.data.history.every((entry) => entry.reason === "Requested account support" && entry.actor_name === "Support admin"));
    const self = await request(`/api/command/members/${admin.id}/recovery`, "POST", admin.cookie, actionBody("revoke_sessions"));
    assert.equal(self.status, 200);
    assert.equal(self.data.signed_out, true);
    assert.equal((await request("/api/auth/session", "GET", admin.cookie)).data.user, null);
  } finally {
    try {
      await client.query("delete from login_codes where email_hash = any(select email_hash from users where id=any($1::uuid[]))", [users]);
      await client.query("delete from command_followup_history where followup_id in (select id from command_followups where user_id=any($1::uuid[]))", [users]);
      await client.query("delete from command_followups where user_id=any($1::uuid[])", [users]);
      await client.query("delete from users where id=any($1::uuid[])", [users]);
    } finally {
      await client.end();
    }
  }
});
