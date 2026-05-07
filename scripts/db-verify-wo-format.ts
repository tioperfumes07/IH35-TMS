import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const regex = /^WO-[A-Za-z0-9]+-(IS|ES|AC|ET|RT|IT|RS)-\d{2}-\d{2}-\d{4}-\d{4}-[A-Za-z0-9]{5}$/;

try {
  const client = await pool.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const rows = await client.query<{ display_id: string }>(
      `SELECT display_id FROM maintenance.work_orders WHERE display_id IS NOT NULL ORDER BY created_at DESC LIMIT 200`
    );
    for (const row of rows.rows) {
      if (!regex.test(String(row.display_id))) {
        throw new Error(`display_id does not match WO format: ${row.display_id}`);
      }
    }
    console.log(`PASS: WO display ID format verified on ${rows.rows.length} rows.`);
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-wo-format -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
