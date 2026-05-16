import pg from "pg";
import { buildPgPoolConfig } from "../lib/pg-connection-options.js";

const { Pool } = pg;
const APP_DB_ROLE = "ih35_app";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (!process.env.DATABASE_DIRECT_URL) {
  throw new Error("DATABASE_DIRECT_URL is required");
}

function buildLuciaConnString(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("options", "-c app.bypass_rls=lucia");
  return url.toString();
}

export const pool = new Pool(
  buildPgPoolConfig(process.env.DATABASE_URL, {
    max: 10,
  }),
);

export const luciaPool = new Pool(
  buildPgPoolConfig(buildLuciaConnString(process.env.DATABASE_DIRECT_URL), {
    max: 10,
    idleTimeoutMillis: 30_000,
  }),
);

luciaPool.on("connect", async (client) => {
  try {
    await client.query(`SET ROLE ${APP_DB_ROLE}`);
  } catch (err) {
    console.error("Failed to set auth role for luciaPool connection:", err);
  }
});

pool.on("connect", async (client) => {
  try {
    await client.query(`SET ROLE ${APP_DB_ROLE}`);
  } catch (err) {
    console.error("Failed to set auth role for pool connection:", err);
  }
});

luciaPool.on("error", (err) => {
  console.error("Unexpected luciaPool error:", err);
});

pool.on("error", (err) => {
  console.error("Unexpected pool error:", err);
});

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
