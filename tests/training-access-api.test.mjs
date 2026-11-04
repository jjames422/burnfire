import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;
const baseUrl = process.env.BURNFIRE_API_TEST_URL;

test("trainers manage only assigned recruits, R4 tracks all, and only R5/site admins edit current content", {
  skip: !connectionString || !baseUrl,
}, async () => {
  const db = new URL(connectionString);
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(db.hostname));
  assert.equal(db.port, "5433");
  assert.equal(db.pathname, "/burnfire");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const client = new pg.Client({ connectionString });
  const suffix = randomBytes(8).toString("hex");
  const ids = [];
  const contentIds = [];
  await client.connect();
  async function account(label, rank, admin = false) {
    const { rows: [user] } = await client.query("insert into users (email) values ($1) returning id", [`training-${label}-${suffix}@example.invalid`]);
    ids.push(user.id);
    await client.query("insert into profiles (id,in_game_name) values ($1,$2)", [user.id, `Training ${label} ${suffix}`]);
    if (admin) await client.query("insert into platform_admins (user_id) values ($1)", [user.id]);
    await client.query(
      `insert into alliance_members (user_id,alliance,game_rank,alliance_title,verified_at)
       values ($1,'burnfire',$2,case when $2::game_rank='r5' then 'alliance_leader'::alliance_title else null end,now())`, [user.id, rank],
    );
    const token = randomBytes(32).toString("base64url");
    await client.query("insert into sessions (user_id,token_hash,expires_at) values ($1,$2,now()+interval '1 day')", [user.id, createHash("sha256").update(token).digest("hex")]);
    return { ...user, cookie: `bf_session=${token}` };
  }
  async function request(path, actor, method = "GET", body) {
    const response = await fetch(new URL(`/api/command/${path}`, origin), {
      method, headers: { Cookie: actor.cookie, Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, data };
  }
  try {
    const admin = await account("admin", "r4", true);
    const trainer = await account("trainer", "r3");
    const r4 = await account("officer", "r4");
    const leader = await account("leader", "r5");
    const own = await account("assigned", "r1");
    const other = await account("other", "r1");
    await client.query(
      `update academy_enrollments set assigned_officer=$2,game_identifier='TRAINING-ID',
       identity_status='pending',completed_at=null where user_id=$1`, [own.id, trainer.id],
    );
    await client.query("update academy_enrollments set game_identifier='OTHER-ID',assigned_officer=$2 where user_id=$1", [other.id, r4.id]);
    const { rows: [section] } = await client.query("select id from academy_content where status='published' and content_type='rule' order by slug limit 1");
    const { rows: [ownIssue] } = await client.query("insert into command_followups (user_id,content_id,issue_key,reason,assigned_to) values ($1,$2,'test:training','Assigned support',$3) returning id", [own.id, section.id, trainer.id]);
    const { rows: [otherIssue] } = await client.query("insert into command_followups (user_id,content_id,issue_key,reason,assigned_to) values ($1,$2,'test:training','Other support',$3) returning id", [other.id, section.id, r4.id]);
    await client.query("insert into academy_progress (user_id,content_id,status,needs_assistance) values ($1,$2,'needs_assistance',true),($3,$2,'needs_assistance',true)", [own.id, section.id, other.id]);
    await client.query("insert into academy_quiz_attempts (user_id,content_id,answers,correct_count,question_count,passed) values ($1,$2,'{}',0,1,false),($3,$2,'{}',0,1,false)", [own.id, section.id, other.id]);

    const overview = await request("overview", trainer);
    assert.equal(overview.status, 200);
    assert.equal(overview.data.assigned_only, true);
    assert.equal(overview.data.can_edit_content, false);
    assert.equal(Number(overview.data.metrics.tracked_members), 1);
    assert.equal(Number(overview.data.metrics.open_followups), 1);
    assert.equal(Number(overview.data.metrics.failed_knowledge_checks), 1);
    assert.equal(Number(overview.data.metrics.needs_assistance), 1);
    const roster = await request("recruits", trainer);
    assert.deepEqual(roster.data.recruits.map((row) => row.user_id), [own.id]);
    assert.equal(roster.data.total, 1);
    assert.equal(Object.hasOwn(roster.data.recruits[0], "email"), false);
    for (const [route, field] of [["training", "training"], ["attention", "attention"], ["followups", "followups"]]) {
      const result = await request(route, trainer);
      assert.equal(result.status, 200);
      assert.ok(result.data[field].length > 0);
      assert.ok(result.data[field].every((row) => row.user_id === own.id), route);
    }
    const reports = await request("reports", trainer);
    const confusion = reports.data.confusion.find((row) => row.failed_latest > 0);
    assert.equal(confusion.failed_latest, 1);
    assert.equal(confusion.help_requests, 1);
    assert.equal(reports.data.officer_followups.reduce((sum, row) => sum + row.unresolved_tasks, 0), 1);
    const csv = await request("reports?format=csv", trainer);
    assert.match(csv.data, new RegExp(`Training assigned ${suffix}`));
    assert.doesNotMatch(csv.data, new RegExp(`Training other ${suffix}`));
    assert.equal((await request(`recruits/${own.id}`, trainer)).status, 200);
    assert.equal((await request(`recruits/${other.id}`, trainer)).status, 404);
    assert.equal((await request(`recruits/${other.id}/identity`, trainer, "PATCH", { verified: true })).status, 404);
    assert.equal((await request(`recruits/${other.id}/notes`, trainer, "POST", { body: "Forbidden note" })).status, 404);
    const ownNote = await request(`recruits/${own.id}/notes`, trainer, "POST", { body: "Assigned recruit note" });
    assert.equal(ownNote.status, 200);
    const otherNote = await request(`recruits/${other.id}/notes`, r4, "POST", { body: "Other recruit note" });
    assert.equal((await request(`notes/${otherNote.data.note_id}`, trainer, "PATCH", { body: "Forbidden change" })).status, 404);
    assert.equal((await request(`notes/${ownNote.data.note_id}`, trainer, "PATCH", { body: "Updated assigned note" })).status, 200);
    assert.equal((await request(`recruits/${own.id}/identity`, trainer, "PATCH", { verified: true })).status, 200);
    assert.equal((await request("followups", trainer, "PATCH", { id: otherIssue.id, status: "resolved" })).status, 404);
    assert.equal((await request("followups", trainer, "PATCH", { id: ownIssue.id, assigned_to: r4.id })).status, 403);
    assert.equal((await request("followups", trainer, "PATCH", { id: ownIssue.id, status: "resolved" })).status, 200);
    const { rows: [score] } = await client.query("select passed from academy_quiz_attempts where user_id=$1", [own.id]);
    assert.equal(score.passed, false, "Resolving help never approves a failed quiz");
    assert.equal((await request(`recruits/${own.id}/assignment`, trainer, "PATCH", { assigned_to: r4.id })).status, 403);
    assert.equal((await request("members", trainer, "PATCH", { user_id: own.id, game_rank: "r3" })).status, 403);
    assert.equal((await request("members", trainer)).status, 403);

    for (const actor of [trainer, r4]) {
      assert.equal((await request("content", actor)).status, 403);
      assert.equal((await request("content", actor, "POST", { action: "save" })).status, 403);
      assert.equal((await request("content", actor, "POST", { action: "publish", id: section.id })).status, 403);
    }
    const r4Overview = await request("overview", r4);
    assert.equal(r4Overview.data.assigned_only, false);
    assert.equal(r4Overview.data.can_edit_content, false);
    assert.equal((await request(`recruits/${other.id}`, r4)).status, 200);
    assert.equal((await request("members", r4, "PATCH", { user_id: other.id, game_rank: "r2" })).status, 200);
    for (const actor of [admin, leader]) {
      assert.equal((await request("overview", actor)).data.can_edit_content, true);
      assert.equal((await request("content", actor)).status, 200);
    }
    const slug = `training-test-${suffix}`;
    const payload = { action: "save", slug, title: "Test announcement", body: "Test content", content_type: "announcement", required: false, verification_status: "verified", questions: [] };
    const first = await request("content", admin, "POST", payload);
    assert.equal(first.status, 200);
    contentIds.push(first.data.id);
    assert.equal((await request("content", leader, "POST", { action: "publish", id: first.data.id })).status, 200);
    const second = await request("content", leader, "POST", { ...payload, body: "Updated content" });
    assert.equal(second.status, 200);
    contentIds.push(second.data.id);
    assert.equal((await request("content", admin, "POST", { action: "publish", id: second.data.id })).status, 200);
    const listing = await request("content", admin);
    assert.ok(listing.data.content.every((item) => item.status !== "retired"));
    assert.equal(listing.data.content.some((item) => item.id === first.data.id), false);
    assert.equal(listing.data.content.some((item) => item.id === second.data.id), true);
    const { rows: [retained] } = await client.query("select status from academy_content where id=$1", [first.data.id]);
    assert.equal(retained.status, "retired", "History is retained, not deleted");
    await client.query("update academy_enrollments set assigned_officer=$2 where user_id=$1", [own.id, r4.id]);
    assert.equal((await request(`recruits/${own.id}`, trainer)).status, 404);
    assert.equal((await request(`notes/${ownNote.data.note_id}`, trainer, "PATCH", { body: "Old trainer edit" })).status, 404);
    assert.equal(Number((await request("overview", trainer)).data.metrics.tracked_members), 0);
  } finally {
    try {
      await client.query("delete from command_note_history where note_id in(select id from command_notes where user_id=any($1::uuid[]))", [ids]);
      await client.query("delete from command_notes where user_id=any($1::uuid[])", [ids]);
      await client.query("delete from command_followup_history where followup_id in(select id from command_followups where user_id=any($1::uuid[]))", [ids]);
      await client.query("delete from command_followups where user_id=any($1::uuid[])", [ids]);
      await client.query("delete from academy_content where id=any($1::uuid[])", [contentIds]);
      await client.query("delete from users where id=any($1::uuid[])", [ids]);
    } finally { await client.end(); }
  }
});
