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
    const reportsRes = await client.query<{ ok: boolean }>("SELECT to_regclass('compliance.form_425c_reports') IS NOT NULL AS ok");
    if (!reportsRes.rows[0]?.ok) throw new Error("compliance.form_425c_reports missing");
    console.log("PASS: compliance.form_425c_reports exists");

    const exhibitARes = await client.query<{ ok: boolean }>("SELECT to_regclass('compliance.form_425c_exhibit_a_entries') IS NOT NULL AS ok");
    if (!exhibitARes.rows[0]?.ok) throw new Error("compliance.form_425c_exhibit_a_entries missing");
    console.log("PASS: compliance.form_425c_exhibit_a_entries exists");

    const exhibitBRes = await client.query<{ ok: boolean }>("SELECT to_regclass('compliance.form_425c_exhibit_b_entries') IS NOT NULL AS ok");
    if (!exhibitBRes.rows[0]?.ok) throw new Error("compliance.form_425c_exhibit_b_entries missing");
    console.log("PASS: compliance.form_425c_exhibit_b_entries exists");

    const sample = await client.query("SELECT id, reporting_month, status FROM compliance.form_425c_reports LIMIT 5");
    console.log(`PASS: sample report query executed (${sample.rows.length} row(s))`);
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-form-425c -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
