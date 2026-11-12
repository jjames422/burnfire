import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { emailIndex, storedEmail } from "./email-fixtures.mjs";

const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;

test("Regent constraints, combined identity, and alliance access survive schema reruns", { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.port, "5433");
  assert.ok(["/burnfire", "/burnfire_test"].includes(url.pathname));
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = `regent_test_${randomBytes(8).toString("hex")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
    await client.query(sql);
    await client.query(sql);
    async function member(name, rank, title, regent = false) {
      const { rows: [user] } = await client.query("insert into users (email_hash, email_encrypted) values ($1, $2) returning id", storedEmail(`${name.toLowerCase()}@example.invalid`));
      await client.query("insert into profiles (id, in_game_name) values ($1, $2)", [user.id, name]);
      await client.query(
        `insert into alliance_members (alliance, user_id, game_rank, alliance_title, is_regent, verified_at)
         values ('burnfire', $1, $2, $3, $4, now())`, [user.id, rank, title, regent],
      );
      return user.id;
    }
    async function rejected(statement, params, code) {
      await client.query("SAVEPOINT rejected_change");
      await assert.rejects(client.query(statement, params), (error) => error.code === code);
      await client.query("ROLLBACK TO SAVEPOINT rejected_change");
    }
    const leader = await member("Leader", "r5", "alliance_leader");
    const regent = await member("RegentPlayer", "r4", "diplomat", true);
    const officer = await member("Officer", "r4", "god_of_war");
    for (const [id, role, identity] of [
      [leader, "admin", "[BFA] Leader · Alliance Leader"],
      [regent, "admin", "[BFA] RegentPlayer · Regent · Diplomat"],
      [officer, "officer", "[BFA] Officer · God of War"],
    ]) {
      const { rows: [row] } = await client.query(
        `select user_role($1, 'burnfire') as role, format_member_identity($1) as identity,
                permission_role, is_platform_admin($1) as site_admin from profiles where id = $1`, [id],
      );
      assert.equal(row.role, role);
      assert.equal(row.permission_role, role);
      assert.equal(row.identity, identity);
      assert.equal(row.site_admin, false);
    }
    await rejected("update alliance_members set is_regent = true where user_id = $1", [officer], "23505");
    await rejected("update alliance_members set alliance_title = 'diplomat' where user_id = $1", [officer], "23505");
    await rejected("update alliance_members set alliance_title = null where user_id = $1", [regent], "23514");
    await rejected("update alliance_members set game_rank = 'r3', alliance_title = null where user_id = $1", [regent], "23514");
    await rejected("update alliance_members set alliance_title = null where user_id = $1", [leader], "23514");
    await rejected("update alliance_members set game_rank = 'r5', alliance_title = 'alliance_leader' where user_id = $1", [officer], "23505");
    await client.query("update alliance_members set is_regent = false where user_id = $1", [regent]);
    const { rows: [removed] } = await client.query(
      "select user_role($1, 'burnfire') as role, format_member_identity($1) as identity, permission_role from profiles where id = $1", [regent],
    );
    assert.equal(removed.role, "officer");
    assert.equal(removed.permission_role, "officer");
    assert.equal(removed.identity, "[BFA] RegentPlayer · Diplomat");
    await client.query("update alliance_members set is_regent = true where user_id = $1", [officer]);
    await client.query("update alliance_members set verified_at = null where user_id = $1", [officer]);
    const { rows: [unverified] } = await client.query("select user_role($1, 'burnfire') as role", [officer]);
    assert.equal(unverified.role, null);
    await client.query(sql);
    assert.equal((await client.query("select is_regent from alliance_members where user_id = $1", [officer])).rows[0].is_regent, true);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
