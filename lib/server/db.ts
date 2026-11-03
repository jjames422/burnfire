import { Pool, type QueryResultRow } from "pg";

/**
 * Connection pool for the dedicated burnfire Postgres cluster (its own
 * instance on port 5433 — fully isolated from any other site's database).
 * Stored on globalThis so dev-mode hot reloads reuse one pool.
 */
const globalForDb = globalThis as unknown as { burnfirePool?: Pool };

export const pool =
  globalForDb.burnfirePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Small per-instance pool — serverless hosting runs many instances.
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
  });

globalForDb.burnfirePool = pool;

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
