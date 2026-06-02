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

export async function withLuciaBypass<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await luciaPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn(client);
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
    await client.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [userUuid]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
