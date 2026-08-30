import pg from "pg";
import { buildPgPoolConfig } from "../lib/pg-connection-options.js";
import {
  afterCommitMark,
  afterCommitRollbackTo,
  beginAfterCommitScope,
  discardAfterCommit,
  drainAfterCommit,
} from "../lib/after-commit.js";

const { Pool } = pg;
const APP_DB_ROLE = "ih35_app";

/** Boot smoke only: connect as DATABASE_URL user without SET ROLE (CI/local superuser). Never use in production. */
function skipPoolAppRole(): boolean {
  return process.env.IH35_BOOT_API_SMOKE === "true" && process.env.NODE_ENV === "test";
}

let poolInstance: pg.Pool | null = null;
let luciaPoolInstance: pg.Pool | null = null;

// Render runs two API instances and this module owns two independent pools per
// instance. Both use pooled DATABASE_URL (pgbouncer). Bypass is SET LOCAL inside
// withLuciaBypass — never a startup `options=` GUC (pgbouncer rejects it; a
// second DIRECT pool exhausted Neon ~30 backends so auth hung while shallow
// health stayed green). Keep the aggregate default at 20 and allow an explicit,
// bounded override for capacity changes.
function poolMax(name: "DATABASE_POOL_MAX"): number {
  const raw = process.env[name]?.trim();
  if (!raw) return 5;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error(`${name} must be an integer from 1 to 10`);
  }
  return parsed;
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

function buildPool(): pg.Pool {
  const client = new Pool(
    buildPgPoolConfig(requireDatabaseUrl(), {
      max: poolMax("DATABASE_POOL_MAX"),
    }),
  );
  client.on("connect", async (conn) => {
    if (skipPoolAppRole()) return;
    try {
      await conn.query(`SET ROLE ${APP_DB_ROLE}`);
    } catch (err) {
      console.error("Failed to set auth role for pool connection:", err);
    }
  });
  client.on("error", (err) => {
    console.error("Unexpected pool error:", err);
  });
  return client;
}

function buildLuciaPool(): pg.Pool {
  // Pooled DATABASE_URL (pgbouncer). Bypass is SET LOCAL in withLuciaBypass, not
  // a startup `options=` GUC — pgbouncer transaction pooling strips/fails those,
  // and a second DIRECT pool doubled Neon backends (2 instances × 2 pools)
  // until auth hung while shallow health stayed green.
  const client = new Pool(
    buildPgPoolConfig(requireDatabaseUrl(), {
      max: poolMax("DATABASE_POOL_MAX"),
      idleTimeoutMillis: 30_000,
    }),
  );
  client.on("connect", async (conn) => {
    if (skipPoolAppRole()) return;
    try {
      await conn.query(`SET ROLE ${APP_DB_ROLE}`);
    } catch (err) {
      console.error("Failed to set auth role for luciaPool connection:", err);
    }
  });
  client.on("error", (err) => {
    console.error("Unexpected luciaPool error:", err);
  });
  return client;
}

function createLazyPool(getter: () => pg.Pool): pg.Pool {
  return new Proxy({} as pg.Pool, {
    get(_target, prop, receiver) {
      const instance = getter() as unknown as Record<PropertyKey, unknown>;
      const value = Reflect.get(instance, prop, receiver);
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(instance);
      }
      return value;
    },
  });
}

export function getPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = buildPool();
  }
  return poolInstance;
}

export function getLuciaPool(): pg.Pool {
  if (!luciaPoolInstance) {
    luciaPoolInstance = buildLuciaPool();
  }
  return luciaPoolInstance;
}

export const pool: pg.Pool = createLazyPool(getPool);
export const luciaPool: pg.Pool = createLazyPool(getLuciaPool);

/** All-zeros sentinel — valid uuid syntax; matches no real tenant row (defense-in-depth for RLS). */
export const LUCIA_BYPASS_SENTINEL_COMPANY_ID = "00000000-0000-0000-0000-000000000000";

// ── Runtime unused-positional-param guard (Block 07) ────────────────────────────────────────────────
// A parameterized query that passes N binds but never references some $i (i ≤ N) makes Postgres unable
// to type $i → 42P18 "could not determine data type of parameter $1" (the geofence-timeline 500). The
// static regex guard can't see assembled queries; at RUNTIME the final SQL text is known, so we check it
// here — on the path EVERY scoped query funnels through (withCurrentUser/withLuciaBypass/withCompanyScope).
// Dev/test/CI only (never the prod hot path).
// FAIL-A1 — mirrors the shape `audit.tg_audit_row` validates before casting the actor GUC to uuid.
// Kept identical on purpose: if the wrapper accepted a value the trigger then rejects, the row would be
// recorded as unattributed and the mismatch would be invisible.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertNoUnusedQueryParams(text: string, values: readonly unknown[] | undefined): void {
  if (process.env.NODE_ENV === "production") return;
  if (!values || values.length === 0) return;
  const referenced = new Set<number>();
  for (const m of text.matchAll(/\$(\d+)\b/g)) referenced.add(Number(m[1]));
  for (let i = 1; i <= values.length; i++) {
    if (!referenced.has(i)) {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
      throw new Error(
        `[unused-query-param] bind $${i} is passed (${values.length} value(s)) but never referenced in the SQL ` +
        `— Postgres cannot type it (42P18). Bind only what the query uses. Query: ${snippet}…`
      );
    }
  }
}

// Wrap a pooled client so its .query runs the assertion first (non-prod only). A Proxy avoids mutating
// the shared pooled client; all other members pass through unchanged.
function instrumentClientForDev<C extends pg.PoolClient>(client: C): C {
  if (process.env.NODE_ENV === "production") return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "query") {
        const original = target.query.bind(target);
        return (...args: unknown[]) => {
          const first = args[0];
          if (typeof first === "string") {
            assertNoUnusedQueryParams(first, Array.isArray(args[1]) ? (args[1] as unknown[]) : undefined);
          } else if (first && typeof first === "object" && typeof (first as { text?: unknown }).text === "string") {
            const cfg = first as { text: string; values?: unknown[] };
            assertNoUnusedQueryParams(cfg.text, cfg.values);
          }
          return (original as (...a: unknown[]) => unknown)(...args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as C;
}

/**
 * FAIL-A1 — the audit trail cannot name who acted on a bypass transaction.
 *
 * `audit.tg_audit_row` resolves its actor from `app.current_user_id` (falling back to the legacy
 * `app.user_id`). `withCurrentUser` sets it; THIS wrapper never did, so every write made through the
 * bypass path lands in `audit.row_changes` with `changed_by_user_id = NULL` — measured live: 75 of 139
 * loads carry a NULL actor. An append-only audit trail that cannot say WHO is evidence of a change and
 * nothing more, which is precisely what an auditor or attorney needs it for.
 *
 * `actorUserId` is OPTIONAL by design and this is the honest trade-off: some legitimate callers are
 * genuinely system-initiated (cron, outbox drain, migrations-adjacent maintenance) and inventing a user
 * for them would be worse than a NULL — it would attribute machine writes to a person. So the wrapper
 * carries the actor when the caller has one and stays silent when it does not. Threading the real actor
 * through the remaining call sites is mechanical follow-up work; the plumbing has to exist first.
 */
export async function withLuciaBypass<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  opts?: { actorUserId?: string | null; sessionId?: string | null }
): Promise<T> {
  const client = await luciaPool.connect();
  let scoped: pg.PoolClient | null = null;
  let committed = false;
  try {
    await client.query("BEGIN");
    // #878 fail-closed: same as withCurrentUser — force the non-superuser app role so the
    // RLS bypass goes through the explicit `app.bypass_rls=lucia` GUC path below, never an
    // implicit superuser bypass. If ih35_app can't be assumed the txn fails closed.
    if (!skipPoolAppRole()) {
      await client.query(`SET LOCAL ROLE ${APP_DB_ROLE}`);
    }
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // LV-ORPHANED-GUC-WRITE-ACTIVE-COMPANY-ID: do NOT set app.active_company_id — nothing reads it
    // (pg_proc/pg_policies/pg_views sweep 2026-08-07). Real tenant scoping is app.operating_company_id.
    await client.query(
      "SELECT set_config('app.operating_company_id', $1::text, true)", [LUCIA_BYPASS_SENTINEL_COMPANY_ID]
    );
    // FAIL-A1 — attribute the write when the caller knows who is acting. Set with the same
    // `set_config(..., true)` (transaction-local) form used above, so it cannot leak to the next
    // borrower of this pooled connection. Only a UUID-shaped value is written: the audit trigger
    // regex-validates before casting, so a malformed value would silently become NULL and read as
    // "unattributed" rather than "rejected" — better to never write it than to write a lie.
    const actor = opts?.actorUserId;
    if (typeof actor === "string" && UUID_RE.test(actor)) {
      await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [actor]);
    }
    // ACCT-F257 — same for the session, on this wrapper too. Attributing the user but not the session
    // would answer "who" and still leave "in which session" unanswerable, which is half the question
    // an audit reviewer actually asks.
    const sessionIdLb = opts?.sessionId;
    if (typeof sessionIdLb === "string" && sessionIdLb.length > 0 && sessionIdLb.length <= 255) {
      await client.query("SELECT set_config('app.session_id', $1::text, true)", [sessionIdLb]);
    }
    // LV-REVREC-NOT-FIRING — the after-commit queue is opened on BOTH transaction wrappers, not just
    // withCurrentUser. This one also opens a real BEGIN on its own pool, so a caller here that
    // awaited a GL poster inline would hit the identical cross-connection blindness: the poster
    // takes a SECOND luciaPool client, and under READ COMMITTED that connection cannot see this
    // transaction's uncommitted rows either. Wiring only the scoped wrapper would have drained half
    // the class and left the other half looking guarded. See lib/after-commit.ts.
    scoped = instrumentClientForDev(client);
    beginAfterCommitScope(scoped);
    const result = await fn(scoped);
    await client.query("COMMIT");
    committed = true;
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    // Release BEFORE draining — deferred work runs on its own connection, so holding this pooled
    // client through it would needlessly shrink the pool under load.
    client.release();
    if (scoped) {
      // Drain only on COMMIT; a rolled-back transaction discards its queue, because a side effect
      // must never outlive the write that justified it. drainAfterCommit never throws.
      if (committed) await drainAfterCommit(scoped);
      else discardAfterCommit(scoped);
    }
  }
}

export type SavepointQueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Optional query inside withCurrentUser: failed SQL must not abort the outer transaction. */
export async function withSavepoint<T>(
  client: SavepointQueryClient,
  name: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  const safe = name.replace(/[^a-z0-9_]/gi, "_");
  // The after-commit queue is rolled back with the savepoint. Without this, the bulk runner (which
  // gives EVERY row its own savepoint on this shared client) could roll a row's write back and
  // still fire that row's deferred money side-effect after the outer COMMIT. See lib/after-commit.ts.
  const mark = afterCommitMark(client);
  await client.query(`SAVEPOINT ${safe}`);
  try {
    const out = await fn();
    await client.query(`RELEASE SAVEPOINT ${safe}`);
    return out;
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${safe}`).catch(() => {});
    afterCommitRollbackTo(client, mark);
    return fallback;
  }
}

/**
 * ACCT-F257 — the audit trail records WHICH SESSION acted, and it has never once been able to.
 *
 * `audit.tg_audit_row` writes `session_id` from `current_setting('app.session_id', true)`. Nothing in
 * the backend has ever set that GUC — measured live: `audit.row_changes` holds 2,340,091 rows and
 * `session_id` is populated on ZERO of them.
 *
 * The id is not missing, it is DROPPED. `session-middleware.ts` sets `req.session = { id: ... }` on
 * every authenticated request; it simply never reaches the database wrapper. So "which session booked
 * this load" is unanswerable not because the data was never captured, but because it was captured and
 * discarded one layer above the audit trigger.
 *
 * Optional for the same reason `actorUserId` is on withLuciaBypass: cron, outbox drain and other
 * system writers have no session, and inventing one would be worse than a NULL.
 */
export async function withCurrentUser<T>(
  userUuid: string,
  fn: (client: pg.PoolClient) => Promise<T>,
  opts?: { sessionId?: string | null }
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userUuid)) {
    throw new Error("Invalid UUID for app.current_user_id");
  }
  const client = await pool.connect();
  let scoped: pg.PoolClient | null = null;
  let committed = false;
  try {
    await client.query("BEGIN");
    // #878 fail-closed: force the non-superuser app role transaction-locally, BEFORE any
    // tenant SQL runs. The pool's session-level `SET ROLE` (connect handler) can silently
    // fail or lose the race with the first query, leaving the connection as the DATABASE_URL
    // login (potentially neondb_owner — a superuser that BYPASSES RLS). `SET LOCAL ROLE`
    // here guarantees current_user = ih35_app for every scoped query, so RLS is always
    // enforced; if the role can't be assumed (grant missing) the txn throws and the request
    // fails closed instead of silently leaking across tenants/entities. Skipped only in the
    // CI boot-smoke superuser path where ih35_app may not exist.
    if (!skipPoolAppRole()) {
      await client.query(`SET LOCAL ROLE ${APP_DB_ROLE}`);
    }
    await client.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [userUuid]);
    // ACCT-F257 — carry the session the caller is acting under. Transaction-local like every GUC
    // above, so it cannot leak to the next borrower of this pooled connection. Bounded and
    // non-empty-checked rather than regex-validated: Lucia session ids are opaque tokens, not UUIDs,
    // so demanding a UUID shape here would silently reject every real session and leave the column
    // NULL while looking fixed.
    const sessionIdCu = opts?.sessionId;
    if (typeof sessionIdCu === "string" && sessionIdCu.length > 0 && sessionIdCu.length <= 255) {
      await client.query(`SELECT set_config('app.session_id', $1::text, true)`, [sessionIdCu]);
    }
    // LV-REVREC-NOT-FIRING — this is the ONE funnel every scoped route transaction goes through, so
    // it is where after-commit work is drained. A side-effect that opens its own connection (the
    // revenue latch does, via withLuciaBypass) cannot see this transaction's uncommitted rows;
    // enqueueing it here and running it below COMMIT is what makes that ordering structural instead
    // of a convention each call site has to remember. See lib/after-commit.ts.
    scoped = instrumentClientForDev(client);
    beginAfterCommitScope(scoped);
    const result = await fn(scoped);
    await client.query("COMMIT");
    committed = true;
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    // Release BEFORE draining: the deferred work runs on its own connection, so holding this pooled
    // client through it would needlessly shrink the pool under load.
    client.release();
    if (scoped) {
      // Drain only on COMMIT; a rolled-back transaction discards its queue, because a side effect
      // must never outlive the write that justified it. drainAfterCommit never throws.
      if (committed) await drainAfterCommit(scoped);
      else discardAfterCommit(scoped);
    }
  }
}
