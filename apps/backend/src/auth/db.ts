import pg from "pg";
import { buildPgPoolConfig } from "../lib/pg-connection-options.js";

const { Pool } = pg;
const APP_DB_ROLE = "ih35_app";

/** Boot smoke only: connect as DATABASE_URL user without SET ROLE (CI/local superuser). Never use in production. */
function skipPoolAppRole(): boolean {
  return process.env.IH35_BOOT_API_SMOKE === "true" && process.env.NODE_ENV === "test";
}

let poolInstance: pg.Pool | null = null;
let luciaPoolInstance: pg.Pool | null = null;

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

function requireDatabaseDirectUrl() {
  const url = process.env.DATABASE_DIRECT_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_DIRECT_URL is required");
  }
  return url;
}

function buildLuciaConnString(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", "-c app.bypass_rls=lucia");
  return url.toString();
}

function buildPool(): pg.Pool {
  const client = new Pool(
    buildPgPoolConfig(requireDatabaseUrl(), {
      max: 10,
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
  const client = new Pool(
    buildPgPoolConfig(buildLuciaConnString(requireDatabaseDirectUrl()), {
      max: 10,
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

export async function withLuciaBypass<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await luciaPool.connect();
  try {
    await client.query("BEGIN");
    // #878 fail-closed: same as withCurrentUser — force the non-superuser app role so the
    // RLS bypass goes through the explicit `app.bypass_rls=lucia` GUC path below, never an
    // implicit superuser bypass. If ih35_app can't be assumed the txn fails closed.
    if (!skipPoolAppRole()) {
      await client.query(`SET LOCAL ROLE ${APP_DB_ROLE}`);
    }
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(
      "SELECT set_config('app.active_company_id', $1, true)", [LUCIA_BYPASS_SENTINEL_COMPANY_ID]
    );
    await client.query(
      "SELECT set_config('app.operating_company_id', $1, true)", [LUCIA_BYPASS_SENTINEL_COMPANY_ID]
    );
    const result = await fn(instrumentClientForDev(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
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
  await client.query(`SAVEPOINT ${safe}`);
  try {
    const out = await fn();
    await client.query(`RELEASE SAVEPOINT ${safe}`);
    return out;
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${safe}`).catch(() => {});
    return fallback;
  }
}

export async function withCurrentUser<T>(
  userUuid: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userUuid)) {
    throw new Error("Invalid UUID for app.current_user_id");
  }
  const client = await pool.connect();
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
    const result = await fn(instrumentClientForDev(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
