// One-time migration: encrypts plaintext email columns left by databases
// created before email encryption. Safe to re-run; it only touches rows that
// still have a plaintext address and no ciphertext.
//
//   psql "$DATABASE_URL" -f db/schema.sql          # adds encrypted columns
//   node --env-file=.env.local --experimental-strip-types scripts/encrypt-emails.mjs
//   psql "$DATABASE_URL" -f db/schema.sql          # drops plaintext columns
//
// EMAIL_ENCRYPTION_KEY must be the same key production uses.
import pg from "pg";
import { emailIndex, encryptEmail } from "../lib/server/email-privacy.ts";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function hasPlaintext(table) {
  const { rowCount } = await client.query(
    `select 1 from information_schema.columns
     where table_schema = current_schema() and table_name = $1 and column_name = 'email'`,
    [table],
  );
  return Boolean(rowCount);
}

try {
  await client.query("begin");
  for (const table of ["users", "command_invitations"]) {
    if (!(await hasPlaintext(table))) {
      console.log(`${table}: already encrypted`);
      continue;
    }
    const { rows } = await client.query(
      `select id, email from ${table} where email is not null and (email_hash is null or email_encrypted is null) for update`,
    );
    for (const row of rows) {
      await client.query(
        `update ${table} set email_hash = $2, email_encrypted = $3 where id = $1`,
        [row.id, emailIndex(row.email), encryptEmail(row.email)],
      );
    }
    // Clear the plaintext immediately; the schema run drops the column.
    await client.query(`update ${table} set email = null where email_hash is not null and email_encrypted is not null`);
    console.log(`${table}: encrypted ${rows.length} address(es)`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
