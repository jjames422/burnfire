import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { emailIndex, storedEmail } from "./email-fixtures.mjs";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;

test("isolated schema keeps chat, academy, rank changes, and site administration consistent", {
  skip: !connectionString,
}, async () => {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Tests require a local database");
  assert.equal(url.port, "5433", "Never connect to the shared port-5432 instance");
  assert.ok(["/burnfire", "/burnfire_test"].includes(url.pathname));
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schemaName = `portal_test_${randomBytes(8).toString("hex")}`;
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
    const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
    await client.query(schema);
    await client.query(schema);
    const { rows: [user] } = await client.query("insert into users (email_hash, email_encrypted) values ($1, $2) returning id", storedEmail("portal-test@example.invalid"));
    await client.query("insert into profiles (id, in_game_name) values ($1, 'Test player')", [user.id]);
    await client.query("insert into alliance_members (user_id, alliance, game_rank) values ($1, 'burnfire', 'r1')", [user.id]);
    const { rows: [enrollment] } = await client.query("select identity_status from academy_enrollments where user_id = $1", [user.id]);
    assert.equal(enrollment.identity_status, "pending");
    const { rows: [pendingRole] } = await client.query("select user_role($1, 'burnfire') as role", [user.id]);
    assert.equal(pendingRole.role, null, "Pending identity does not open private alliance chat");
    await client.query("update alliance_members set game_rank = 'r3', verified_at = now() where user_id = $1", [user.id]);
    const { rows: [officer] } = await client.query("select user_role($1, 'burnfire') as role, permission_role from profiles where id = $1", [user.id]);
    assert.equal(officer.role, "officer");
    assert.equal(officer.permission_role, "officer");
    await client.query("update alliance_members set game_rank = 'r2' where user_id = $1", [user.id]);
    const { rows: [demoted] } = await client.query("select user_role($1, 'burnfire') as role", [user.id]);
    assert.equal(demoted.role, "member");
    await client.query("insert into platform_admins (user_id) values ($1)", [user.id]);
    await client.query("update alliance_members set game_rank = 'r4', alliance_title = null where user_id = $1", [user.id]);
    const { rows: [admin] } = await client.query("select am.game_rank, p.permission_role, user_role($1, 'burnfire') as role, is_platform_admin($1) as is_admin from profiles p join alliance_members am on am.user_id = p.id where p.id = $1", [user.id]);
    assert.equal(admin.game_rank, "r4", "Site administration must not imply R5");
    assert.equal(admin.permission_role, "admin");
    assert.equal(admin.role, "admin");
    assert.equal(admin.is_admin, true);
    const { rows: [legacyUser] } = await client.query("insert into users (email_hash, email_encrypted) values ($1, $2) returning id", storedEmail("legacy-invite-test@example.invalid"));
    await client.query("insert into profiles (id, in_game_name) values ($1, 'Legacy invitation test')", [legacyUser.id]);
    const { rows: [invitation] } = await client.query(
      "insert into alliance_invitations (alliance, invitee_id, invited_by, game_rank, permission_role) values ('burnfire', $1, $2, 'r3', 'member') returning id",
      [legacyUser.id, user.id],
    );
    await client.query("select respond_to_alliance_invitation($1,$2,true)", [legacyUser.id, invitation.id]);
    const { rows: [legacyAccess] } = await client.query("select permission_role, exists(select 1 from academy_enrollments where user_id = $1) as enrolled from profiles where id = $1", [legacyUser.id]);
    assert.equal(legacyAccess.permission_role, "officer", "Legacy invitation permission fields cannot override shared rank access");
    assert.equal(legacyAccess.enrolled, true);
    const { rows: [content] } = await client.query("select count(*)::int as count from academy_content where status = 'published'");
    assert.equal(content.count, 13, "Schema reruns preserve the seeded curriculum");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
