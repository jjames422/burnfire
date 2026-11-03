import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// The database lives in the dedicated local Postgres cluster and is defined
// by db/schema.sql (idempotent — re-runnable). This check validates the SQL
// files that ship with the repo.
const directory = join(process.cwd(), "db");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

if (!files.includes("schema.sql")) {
  throw new Error("db/schema.sql is missing.");
}

for (const file of files) {
  const sql = await readFile(join(directory, file), "utf8");
  if (/\bdiscord\b/i.test(file) || /\bdiscord\b/i.test(sql)) {
    throw new Error(`Third-party product naming found in schema file: ${file}`);
  }
}

console.log(`Validated ${files.length} database schema file(s).`);
