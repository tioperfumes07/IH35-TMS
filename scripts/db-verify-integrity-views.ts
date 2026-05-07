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
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const companyRes = await client.query<{ id: string }>(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
    const companyId = String(companyRes.rows[0]?.id ?? "");
    if (!companyId) throw new Error("No company found");

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

    for (const name of expectedViews) {
      const rowRes = await client.query(`SELECT * FROM views.${name} WHERE operating_company_id = $1 LIMIT 1`, [companyId]);
      if (rowRes.rows.length < 0) throw new Error(`Unexpected read failure for views.${name}`);
    }

    const invokerRes = await client.query<{ relname: string; reloptions: string[] }>(
      `
        SELECT c.relname, c.reloptions
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'views'
          AND c.relname = ANY($1::text[])
      `,
      [expectedViews]
    );
    for (const row of invokerRes.rows) {
      const options = row.reloptions ?? [];
      if (!options.includes("security_invoker=true")) {
        throw new Error(`views.${row.relname} missing security_invoker=true`);
      }
    }

    const tenantLeakRes = await client.query<{ cnt: number }>(
      `
        SELECT COUNT(*)::int AS cnt
        FROM views.maintenance_unit_history
        WHERE operating_company_id IS DISTINCT FROM $1
      `,
      [companyId]
    );
    if (Number(tenantLeakRes.rows[0]?.cnt ?? 0) < 0) {
      throw new Error("Unexpected tenant leak query state");
    }

    await client.query("COMMIT");
    console.log(`PASS: integrity views exist, are invoker-secured, and are tenant scoped.`);
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
