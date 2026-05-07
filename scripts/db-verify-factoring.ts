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
    for (const viewName of [
      "views.factoring_summary",
      "views.factoring_recourse_at_risk",
      "views.factoring_chargebacks_fees",
      "views.factoring_statements_settings",
    ]) {
      const res = await client.query<{ ok: boolean }>("SELECT to_regclass($1) IS NOT NULL AS ok", [viewName]);
      if (!res.rows[0]?.ok) throw new Error(`${viewName} missing`);
      console.log(`PASS: ${viewName} exists`);
    }

    const sampleSummary = await client.query(
      `
        SELECT operating_company_id, active_factor_name, recourse_days
        FROM views.factoring_summary
        LIMIT 5
      `
    );
    console.log(`PASS: factoring summary query executed (${sampleSummary.rows.length} row(s))`);

    const sampleRecourse = await client.query(
      `
        SELECT invoice_reference, advance_amount, reserve_amount, days_until_recourse_expiry
        FROM views.factoring_recourse_at_risk
        ORDER BY days_until_recourse_expiry ASC
        LIMIT 5
      `
    );
    console.log(`PASS: factoring recourse query executed (${sampleRecourse.rows.length} row(s))`);
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-factoring -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
