import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;
const baseUrl = process.env.BURNFIRE_API_TEST_URL;
const schema = process.env.BURNFIRE_REGENT_TEST_SCHEMA;

test("Regent appointments preserve title uniqueness, leadership permissions, and audit history", {
  skip: !connectionString || !baseUrl || !schema,
}, async () => {
  const database = new URL(connectionString);
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  assert.equal(database.port, "5433");
  assert.equal(database.pathname, "/burnfire");
  assert.match(schema, /^regent_api_[a-f0-9]+$/);
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    await client.query(`SET search_path TO "${schema}", pg_catalog`);
    await client.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
    async function member(name, rank, title = null, admin = false) {
      const { rows: [user] } = await client.query("insert into users (email) values ($1) returning id", [`${name}@example.invalid`]);
      await client.query("insert into profiles (id, in_game_name) values ($1, $2)", [user.id, name]);
      if (admin) await client.query("insert into platform_admins (user_id) values ($1)", [user.id]);
      await client.query(
        `insert into alliance_members (alliance, user_id, game_rank, alliance_title, verified_at)
         values ('burnfire', $1, $2, $3, now())`, [user.id, rank, title],
      );
      const token = randomBytes(32).toString("hex");
      await client.query("insert into sessions (token_hash, user_id, expires_at) values ($1,$2,now()+interval '1 hour')",
        [createHash("sha256").update(token).digest("hex"), user.id]);
      return { id: user.id, cookie: `bf_session=${token}` };
    }
    async function request(actor, path, method = "GET", body) {
      const response = await fetch(new URL(path, origin), {
        method, headers: { Cookie: actor.cookie, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    }
    async function change(actor, target, rank, title, regent) {
      return request(actor, "/api/command/members", "PATCH", {
        user_id: target.id, game_rank: rank, ...(title === undefined ? {} : { alliance_title: title }),
        ...(regent === undefined ? {} : { is_regent: regent }),
      });
    }
    const admin = await member("siteadmin", "r4", null, true);
    const leader = await member("leader", "r5", "alliance_leader");
    const regent = await member("regent", "r4", "diplomat");
    const warrior = await member("warrior", "r4", "god_of_war");
    const applicant = await member("applicant", "r2");
    const goddess = await member("goddess", "r4", "goddess");
    const recruiter = await member("recruiter", "r4", "recruiter");

    assert.equal((await request(regent, "/api/command/content")).status, 403);
    assert.equal((await change(regent, warrior, "r4", "god_of_war")).status, 403);
    assert.equal((await change(leader, regent, "r4", "diplomat", true)).status, 200);
    const portal = await request(regent, "/api/portal");
    assert.equal(portal.data.access.game_rank, "r4");
    assert.equal(portal.data.access.is_regent, true);
    assert.equal(portal.data.access.is_site_admin, false);
    assert.equal((await request(regent, "/api/command/content")).status, 200);
    assert.equal((await request(regent, "/api/command/overview")).data.can_edit_content, true);
    assert.equal((await request(regent, `/api/command/members/${applicant.id}/recovery`)).status, 403);
    assert.equal((await request(regent, `/api/command/recruits/${leader.id}/identity`, "PATCH", { verified: false })).status, 403);
    assert.equal((await request(warrior, `/api/command/recruits/${regent.id}/identity`, "PATCH", { verified: false })).status, 403);
    const saved = await request(regent, "/api/command/content", "POST", {
      action: "save", slug: "regent-test-announcement", title: "Regent announcement",
      body: "Test-only announcement.", content_type: "announcement", required: false,
      verification_status: "verified",
    });
    assert.equal(saved.status, 200);
    assert.equal((await request(regent, "/api/command/content", "POST", {
      action: "publish", id: saved.data.id,
    })).status, 200);

    assert.equal((await change(regent, warrior, "r4", null)).status, 200);
    assert.equal((await change(regent, warrior, "r4", "god_of_war")).status, 200);
    assert.equal((await change(regent, leader, "r4", null)).status, 403);
    assert.equal((await change(regent, warrior, "r5", "alliance_leader")).status, 403);
    assert.equal((await change(regent, regent, "r4", "diplomat", false)).status, 403);
    assert.equal((await change(regent, regent, "r3", null, false)).status, 403);
    assert.equal((await change(regent, warrior, "r4", "god_of_war", true)).status, 403);
    assert.equal((await change(leader, warrior, "r4", "god_of_war", true)).status, 409);
    assert.equal((await change(leader, warrior, "r4", "diplomat")).status, 409);
    assert.equal((await change(leader, warrior, "r4", null, true)).status, 400);
    assert.equal((await change(leader, warrior, "r3", null, true)).status, 400);
    assert.equal((await change(leader, warrior, "r4", "god_of_war", "true")).status, 400);
    assert.equal((await change(leader, leader, "r5", "alliance_leader")).status, 403);
    assert.equal((await change(admin, leader, "r5", null)).status, 200);

    // Omitted fields must preserve an existing Regent and special title.
    assert.equal((await change(leader, regent, "r4")).status, 200);
    const roster = await request(leader, "/api/command/members");
    const appointed = roster.data.members.find((member) => member.id === regent.id);
    assert.equal(appointed.is_regent, true);
    assert.equal(appointed.alliance_title, "diplomat");
    assert.ok(roster.data.history.some((entry) => entry.member_name === "regent"
      && entry.previous_regent === false && entry.new_regent === true && entry.new_title === "diplomat"));

    // Removing Regent revokes elevated content access on the very next request.
    assert.equal((await change(leader, regent, "r4", "diplomat", false)).status, 200);
    assert.equal((await request(regent, "/api/command/content")).status, 403);
    assert.equal((await request(regent, "/api/command/content", "POST", { action: "save" })).status, 403);
    assert.equal((await change(regent, warrior, "r4", null)).status, 403);
    assert.equal((await change(admin, warrior, "r4", "god_of_war", true)).status, 200);
    assert.equal((await change(leader, warrior, "r2", null, false)).status, 200);
    assert.equal((await request(warrior, "/api/command/content")).status, 403);

    for (const [member, title] of [[goddess, "goddess"], [recruiter, "recruiter"]]) {
      assert.equal((await change(leader, member, "r4", title)).status, 200);
      assert.equal((await change(leader, applicant, "r4", title)).status, 409);
    }
    const raced = await Promise.all([
      change(leader, warrior, "r4", "god_of_war", true),
      change(leader, applicant, "r4", "god_of_war", true),
    ]);
    assert.deepEqual(raced.map((result) => result.status).sort(), [200, 409]);
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
