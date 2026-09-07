import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), "supabase", "migrations");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
const seen = new Set();

for (const file of files) {
  const prefix = file.match(/^\d+/)?.[0];
  if (!prefix) throw new Error(`Migration lacks a numeric prefix: ${file}`);
  if (seen.has(prefix)) throw new Error(`Duplicate migration prefix: ${prefix}`);
  seen.add(prefix);
  const sql = await readFile(join(directory, file), "utf8");
  if (/\bdiscord\b/i.test(file) || /\bdiscord\b/i.test(sql)) {
    throw new Error(`Third-party product naming found in migration: ${file}`);
  }
}

console.log(`Validated ${files.length} ordered migrations.`);
