import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;
const baseUrl = process.env.BURNFIRE_API_TEST_URL;

test("leadership assigns recruits from the list; R3 trainers see only their recruits and what they need help with", {
  skip: !connectionString || !baseUrl,
}, async () => {
  const db = new URL(connectionString);
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(db.hostname));
  assert.equal(db.port, "5433");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const client = new pg.Client({ connectionString });
  const suffix = randomBytes(8).toString("hex");
  const ids = [];
  await client.connect();
  async function account(label, rank) {
    const { rows: [user] } = await client.query("insert into users (email) values ($1) returning id", [`assign-${label}-${suffix}@example.invalid`]);
    ids.push(user.id);
    await client.query("insert into profiles (id,in_game_name) values ($1,$2)", [user.id, `Assign ${label} ${suffix}`]);
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
    const leader = await account("leader", "r4");
    const trainer = await account("trainer", "r3");
    const recruit = await account("recruit", "r1");
    const bystander = await account("bystander", "r1");
    await client.query("update academy_enrollments set assigned_officer=null where user_id=any($1::uuid[])", [[recruit.id, bystander.id]]);
    const { rows: [section] } = await client.query("select id from academy_content where status='published' and content_type='rule' order by slug limit 1");
    await client.query("insert into academy_progress (user_id,content_id,status,needs_assistance) values ($1,$2,'needs_assistance',true)", [recruit.id, section.id]);
    const name = encodeURIComponent(`Assign recruit ${suffix}`);

    // Leadership sees the unassigned recruit, the officer list, and can assign from the list.
    const unassigned = await request(`recruits?officer=unassigned&q=${name}`, leader);
    assert.equal(unassigned.status, 200);
    assert.equal(unassigned.data.can_assign, true);
    assert.deepEqual(unassigned.data.recruits.map((row) => row.user_id), [recruit.id]);
    assert.ok(unassigned.data.officers.some((officer) => officer.id === trainer.id), "R3 trainers are offered as assignees");
    assert.ok(!unassigned.data.officers.some((officer) => officer.id === recruit.id), "R1 members are never offered as officers");
    assert.equal((await request(`recruits?officer=bogus`, leader)).status, 400);

    assert.equal((await request(`recruits/${recruit.id}/assignment`, leader, "PATCH", { assigned_to: trainer.id })).status, 200);
    assert.equal((await request(`recruits/${bystander.id}/assignment`, leader, "PATCH", { assigned_to: recruit.id })).status, 400, "Only verified R3+ can be assigned");
    const byTrainer = await request(`recruits?officer=${trainer.id}&q=${encodeURIComponent(suffix)}`, leader);
    assert.deepEqual(byTrainer.data.recruits.map((row) => row.user_id), [recruit.id]);
    assert.equal(byTrainer.data.recruits[0].assigned_officer_name, `Assign trainer ${suffix}`);
    const { rows: history } = await client.query("select new_officer, changed_by from recruit_assignment_history where user_id=$1", [recruit.id]);
    assert.deepEqual(history, [{ new_officer: trainer.id, changed_by: leader.id }]);

    // The R3 sees only their own recruit, whatever filter they send, and cannot reassign.
    for (const filter of ["all", "unassigned", "me", leader.id]) {
      const own = await request(`recruits?officer=${filter}`, trainer);
      assert.equal(own.status, 200);
      assert.equal(own.data.can_assign, false);
      assert.deepEqual(own.data.officers, []);
      assert.deepEqual(own.data.recruits.map((row) => row.user_id), [recruit.id], `R3 filter ${filter}`);
      assert.equal("email" in own.data.recruits[0], false, "R3 trainers never see recruit emails");
    }
    const help = await request("attention", trainer);
    assert.ok(help.data.attention.some((item) => item.user_id === recruit.id && item.issue_key.startsWith("assistance:")), "R3 sees what their recruit needs help with");
    assert.ok(help.data.attention.every((item) => item.user_id === recruit.id), "R3 sees only their own recruits' needs");
    assert.equal((await request(`recruits/${recruit.id}`, trainer)).status, 200, "R3 opens their recruit's record");
    assert.equal((await request(`recruits/${bystander.id}`, trainer)).status, 404, "R3 cannot open other recruits");
    assert.equal((await request(`recruits/${recruit.id}/assignment`, trainer, "PATCH", { assigned_to: null })).status, 403, "R3 cannot reassign");

    // Leadership can clear the assignment again.
    assert.equal((await request(`recruits/${recruit.id}/assignment`, leader, "PATCH", { assigned_to: null })).status, 200);
    assert.deepEqual((await request("recruits", trainer)).data.recruits, []);
  } finally {
    try {
      await client.query("delete from users where id=any($1::uuid[])", [ids]);
    } finally { await client.end(); }
  }
});
