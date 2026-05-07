import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function relationExists(client, relation) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

const client = await pool.connect();
try {
  const tables = [
    "safety.hos_violations",
    "safety.dot_inspections",
    "safety.csa_scores",
    "safety.complaints",
    "safety.integrity_observations",
  ];

  for (const table of tables) {
    if (!(await relationExists(client, table))) throw new Error(`${table} missing`);
    const count = await client.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
    if (Number(count.rows[0]?.cnt ?? -1) !== 0) throw new Error(`${table} row count expected 0`);
  }

  const complaintTypeCount = await client.query(
    `
      SELECT COUNT(*)::int AS cnt
      FROM catalogs.complaint_types
    `
  );
  if (Number(complaintTypeCount.rows[0]?.cnt ?? 0) < 7) throw new Error("catalogs.complaint_types has fewer than 7 rows");

  const rlsTables = [
    "safety.hos_violations",
    "safety.dot_inspections",
    "safety.csa_scores",
    "safety.complaints",
    "safety.integrity_observations",
  ];
  for (const table of rlsTables) {
    const rls = await client.query(
      `
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = split_part($1, '.', 1)
          AND c.relname = split_part($1, '.', 2)
      `,
      [table]
    );
    if (!rls.rows[0]?.relrowsecurity) throw new Error(`${table} RLS not enabled`);
  }

  const companyRow = await client.query(`SELECT id::text AS id FROM org.companies LIMIT 1`);
  const companyId = companyRow.rows[0]?.id;
  if (!companyId) throw new Error("No company rows found");

  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    await client.query("SELECT set_config('app.user_role', 'manager', true)");
    const managerRows = await client.query(`SELECT * FROM safety.complaints LIMIT 1`);
    if (managerRows.rows.length !== 0) throw new Error("manager can read complaints rows");
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    await client.query("SELECT set_config('app.user_role', 'safety', true)");
    await client.query(`SELECT * FROM safety.complaints LIMIT 1`);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`safety role complaints read failed: ${String(error.message || error)}`);
  }

  const views = [
    "safety.v_wo_cost_outliers",
    "safety.v_fuel_mpg_anomalies",
    "safety.v_driver_dwell_outliers",
    "safety.v_hos_pattern_breaks",
  ];
  for (const view of views) {
    if (!(await relationExists(client, view))) throw new Error(`${view} missing`);
    const sec = await client.query(
      `
        SELECT reloptions
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = split_part($1, '.', 1)
          AND c.relname = split_part($1, '.', 2)
      `,
      [view]
    );
    const relOptions = sec.rows[0]?.reloptions ?? [];
    const hasInvoker = Array.isArray(relOptions) && relOptions.some((opt) => String(opt).includes("security_invoker=true"));
    if (!hasInvoker) throw new Error(`${view} missing security_invoker=true`);
  }

  const auditCount = await client.query(
    `
      SELECT COUNT(*)::int AS cnt
      FROM catalogs.audit_event_types
      WHERE code LIKE 'safety.%'
    `
  );
  if (Number(auditCount.rows[0]?.cnt ?? 0) < 13) throw new Error("catalogs.audit_event_types has fewer than 13 safety.* rows");

  console.log("PASS: db-verify-safety-v6-4");
} catch (error) {
  console.error(`FAIL: db-verify-safety-v6-4 -> ${String(error.message || error)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
