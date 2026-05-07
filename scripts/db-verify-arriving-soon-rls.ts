import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  const client = await pool.connect();
  try {
    const relRes = await client.query<{ ok: boolean }>(`SELECT to_regclass('maintenance.v_arriving_soon') IS NOT NULL AS ok`);
    if (!relRes.rows[0]?.ok) throw new Error("maintenance.v_arriving_soon missing");

    const invokerRes = await client.query<{ reloptions: string[] | null }>(
      `
        SELECT reloptions
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'maintenance'
          AND c.relname = 'v_arriving_soon'
          AND c.relkind = 'v'
        LIMIT 1
      `
    );
    const options = invokerRes.rows[0]?.reloptions ?? [];
    if (!Array.isArray(options) || !options.includes("security_invoker=true")) {
      throw new Error("maintenance.v_arriving_soon is missing security_invoker=true");
    }
    console.log("PASS: maintenance.v_arriving_soon has security_invoker=true");

    const explainRes = await client.query(
      `
        EXPLAIN
        SELECT *
        FROM maintenance.v_arriving_soon
        LIMIT 1
      `
    );
    if (!explainRes.rows.length) throw new Error("unable to EXPLAIN maintenance.v_arriving_soon");
    console.log("PASS: maintenance.v_arriving_soon query plan generated");
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-arriving-soon-rls -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
