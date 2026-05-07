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
    await client.query("SET ROLE ih35_app");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const tablesRes = await client.query<{ relname: string }>(
      `
        SELECT relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'maintenance'
          AND c.relkind = 'r'
          AND c.relname IN ('parts_inventory','parts_invoice_links')
      `
    );
    const names = new Set(tablesRes.rows.map((row) => row.relname));
    if (!names.has("parts_inventory")) throw new Error("Missing maintenance.parts_inventory");
    if (!names.has("parts_invoice_links")) throw new Error("Missing maintenance.parts_invoice_links");

    const requiredCols = [
      "work_order_id",
      "vendor_id",
      "vendor_invoice_number",
      "vendor_invoice_amount",
      "qty_used",
      "part_description",
      "parts_inventory_id",
    ];
    const colsRes = await client.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'maintenance'
          AND table_name = 'parts_invoice_links'
      `
    );
    const colNames = new Set(colsRes.rows.map((row) => row.column_name));
    for (const col of requiredCols) {
      if (!colNames.has(col)) throw new Error(`Missing column maintenance.parts_invoice_links.${col}`);
    }

    console.log("PASS: parts invoice links schema checks completed.");
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-parts-invoice-links -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
