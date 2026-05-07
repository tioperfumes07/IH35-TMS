import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function hasColumn(client: pg.PoolClient, schema: string, table: string, column: string) {
  const res = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1
    `,
    [schema, table, column]
  );
  return res.rowCount === 1;
}

async function expectColumns(client: pg.PoolClient, schema: string, table: string, columns: string[]) {
  for (const column of columns) {
    if (!(await hasColumn(client, schema, table, column))) {
      throw new Error(`${schema}.${table}.${column} missing`);
    }
  }
}

const client = await pool.connect();
try {
  await expectColumns(client, "maintenance", "work_order_lines", [
    "section",
    "parent_line_uuid",
    "expense_category_uuid",
    "service_item_uuid",
    "part_uuid",
    "labor_rate_uuid",
    "part_location_codes",
  ]);
  await expectColumns(client, "accounting", "bill_lines", [
    "section",
    "parent_line_uuid",
    "expense_category_uuid",
    "service_item_uuid",
    "part_uuid",
    "labor_rate_uuid",
    "part_location_codes",
    "linked_wo_line_uuid",
  ]);
  await expectColumns(client, "accounting", "expense_lines", [
    "section",
    "parent_line_uuid",
    "expense_category_uuid",
    "service_item_uuid",
    "part_uuid",
    "labor_rate_uuid",
    "part_location_codes",
    "linked_wo_line_uuid",
  ]);
  console.log("PASS: db-verify-two-section-schema");
} catch (error) {
  console.error(`FAIL: db-verify-two-section-schema -> ${String((error as Error).message || error)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
