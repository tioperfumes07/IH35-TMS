/**
 * ROUND 329 — engine idempotency standard (docs/specs/ENGINE-HEADER-TEMPLATE.md): a scheduled engine takes its
 * idempotency from the DATABASE, never from a read-then-write check in application code.
 *
 * tryXactSingleFlight takes a TRANSACTION-scoped advisory lock on the caller's open transaction (every
 * withLuciaBypass / withCompanyScope callback is one). The lock is held until that transaction ends and is released
 * by Postgres on commit, rollback or disconnect — safe behind pgbouncer transaction pooling, where a session lock is
 * not. Returns false when another replica / overlapping tick already holds the key: the caller skips the tick.
 */
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export async function tryXactSingleFlight(client: Queryable, key: string): Promise<boolean> {
  const res = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext($1::text)) AS locked`, [key]);
  return res.rows[0]?.locked === true;
}
