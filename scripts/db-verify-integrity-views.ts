import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const expectedViews = [
  "maintenance_unit_history",
  "maintenance_driver_history",
  "maintenance_vendor_history",
  "maintenance_fleet_baselines",
];

try {
  const client = await pool.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const viewsRes = await client.query<{ viewname: string }>(
      `
        SELECT viewname
        FROM pg_views
        WHERE schemaname = 'views'
          AND viewname = ANY($1::text[])
      `,
      [expectedViews]
    );
    const names = new Set(viewsRes.rows.map((row) => row.viewname));
    for (const name of expectedViews) {
      if (!names.has(name)) throw new Error(`Missing views.${name}`);
    }
    console.log(`PASS: integrity views exist (${expectedViews.length}/${expectedViews.length}).`);
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-integrity-views -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
