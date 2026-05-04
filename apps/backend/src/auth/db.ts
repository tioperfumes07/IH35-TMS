import pg from "pg";

const { Pool } = pg;
const APP_DB_ROLE = "ih35_app";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export const luciaPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

luciaPool.on("connect", async (client) => {
  try {
    await client.query(`SET ROLE ${APP_DB_ROLE}`);
    await client.query("SET app.bypass_rls = 'lucia'");
  } catch (err) {
    console.error("Failed to set auth role / bypass for luciaPool connection:", err);
  }
});

pool.on("connect", async (client) => {
  try {
    await client.query(`SET ROLE ${APP_DB_ROLE}`);
    await client.query("RESET app.bypass_rls");
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
