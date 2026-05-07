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

    const triggerRes = await client.query<{ tgname: string }>(
      `
        SELECT t.tgname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'maintenance'
          AND c.relname = 'work_orders'
          AND t.tgname = 'trg_enforce_wo_completion_invariants'
          AND NOT t.tgisinternal
      `
    );
    if (triggerRes.rows.length !== 1) throw new Error("Missing trg_enforce_wo_completion_invariants");

    const fnRes = await client.query<{ def: string }>(
      `
        SELECT pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'maintenance'
          AND p.proname = 'enforce_wo_completion_invariants'
      `
    );
    if (fnRes.rows.length !== 1) throw new Error("Missing maintenance.enforce_wo_completion_invariants function");
    const body = fnRes.rows[0].def;
    if (!body.includes("E_COST_RECONCILIATION_FAILED")) throw new Error("Guard E_COST_RECONCILIATION_FAILED not found in function");
    if (!body.includes("E_PARTS_INVOICE_LINK_REQUIRED")) throw new Error("Guard E_PARTS_INVOICE_LINK_REQUIRED not found in function");

    console.log("PASS: WO completion guard trigger/function are present with required guard codes.");
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-wo-completion-guards -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
