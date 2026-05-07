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
    const invRes = await client.query<{ ok: boolean }>("SELECT to_regclass('views.catalogs_inventory') IS NOT NULL AS ok");
    if (!invRes.rows[0]?.ok) throw new Error("views.catalogs_inventory missing");
    console.log("PASS: views.catalogs_inventory exists");

    const actRes = await client.query<{ ok: boolean }>("SELECT to_regclass('views.catalogs_recent_activity') IS NOT NULL AS ok");
    if (!actRes.rows[0]?.ok) throw new Error("views.catalogs_recent_activity missing");
    console.log("PASS: views.catalogs_recent_activity exists");

    const qboRes = await client.query<{ ok: boolean }>("SELECT to_regclass('views.qbo_sync_health') IS NOT NULL AS ok");
    if (!qboRes.rows[0]?.ok) throw new Error("views.qbo_sync_health missing");
    console.log("PASS: views.qbo_sync_health exists");

    const helperRes = await client.query<{ ok: boolean }>("SELECT to_regclass('accounting.qbo_remote_counts') IS NOT NULL AS ok");
    if (!helperRes.rows[0]?.ok) throw new Error("accounting.qbo_remote_counts missing");
    console.log("PASS: accounting.qbo_remote_counts exists");

    const countRes = await client.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM views.catalogs_inventory");
    const total = Number(countRes.rows[0]?.total ?? 0);
    if (total !== 64) throw new Error(`views.catalogs_inventory expected 64 rows, got ${total}`);
    console.log("PASS: views.catalogs_inventory has 64 rows");
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-lists-hub -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}

