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
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const companyRes = await client.query<{ id: string }>(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
    const companyId = String(companyRes.rows[0]?.id ?? "");
    if (!companyId) throw new Error("No company found");
    const ownerRes = await client.query<{ id: string }>(`SELECT id FROM identity.users ORDER BY created_at LIMIT 1`);
    const ownerId = String(ownerRes.rows[0]?.id ?? "");

    const unitRes = await client.query<{ id: string }>(
      `SELECT id FROM mdata.units WHERE owner_company_id = $1 OR currently_leased_to_company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId]
    );
    const unitId = String(unitRes.rows[0]?.id ?? "");
    if (!unitId) throw new Error("No unit found for selected company");

    const vendorRes = await client.query<{ id: string }>(
      `SELECT id FROM mdata.vendors ORDER BY created_at LIMIT 1`
    );
    const vendorId = String(vendorRes.rows[0]?.id ?? "");
    if (!vendorId) throw new Error("No vendor found for completion guard verify");

    const year = new Date().getFullYear();
    const extDisplayId = `WO-VERIFY-ES-01-01-${year}-9001-ABCDE`;
    const extSequence = 9001;
    const extWoRes = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.work_orders (
          operating_company_id, unit_id, source_type, unit_sequence, status, wo_type, display_id,
          total_actual_cost, external_vendor_id, external_vendor_wo_number, external_vendor_invoice_number
        ) VALUES ($1,$2,'ES',$3,'open','repair',$4,10000,$5,'WO-X','INV-X')
        RETURNING id
      `,
      [companyId, unitId, extSequence, extDisplayId, vendorId]
    );
    const extWoId = extWoRes.rows[0].id;

    let missingCostReconFailed = false;
    await client.query("SAVEPOINT verify_missing_cost");
    try {
      await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [extWoId]);
    } catch (error) {
      missingCostReconFailed = String((error as Error).message).includes("E_COST_RECONCILIATION_FAILED");
      await client.query("ROLLBACK TO SAVEPOINT verify_missing_cost");
    }
    if (!missingCostReconFailed) throw new Error("Expected E_COST_RECONCILIATION_FAILED when invoice amount missing");

    let mismatchFailed = false;
    await client.query(`UPDATE maintenance.work_orders SET external_vendor_invoice_amount = 10050 WHERE id = $1`, [extWoId]);
    await client.query("SAVEPOINT verify_mismatch_cost");
    try {
      await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [extWoId]);
    } catch (error) {
      mismatchFailed = String((error as Error).message).includes("E_COST_RECONCILIATION_FAILED");
      await client.query("ROLLBACK TO SAVEPOINT verify_mismatch_cost");
    }
    if (!mismatchFailed) throw new Error("Expected mismatch > $0.01 to fail");

    await client.query(`UPDATE maintenance.work_orders SET external_vendor_invoice_amount = 10000, v5_suffix = 'ABCDE' WHERE id = $1`, [extWoId]);
    await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [extWoId]);

    const intDisplayId = `WO-VERIFY-IS-01-01-${year}-9002-ABCDE`;
    const intSequence = 9002;
    const intWoRes = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.work_orders (
          operating_company_id, unit_id, source_type, unit_sequence, status, wo_type, display_id, total_actual_cost, labor_only_no_parts
        ) VALUES ($1,$2,'IS',$3,'open','repair',$4,5000,false)
        RETURNING id
      `,
      [companyId, unitId, intSequence, intDisplayId]
    );
    const intWoId = intWoRes.rows[0].id;

    let partsRequiredFailed = false;
    await client.query("SAVEPOINT verify_parts_required");
    try {
      await client.query(`UPDATE maintenance.work_orders SET v5_suffix = 'ABCDE', status = 'completed' WHERE id = $1`, [intWoId]);
    } catch (error) {
      partsRequiredFailed = String((error as Error).message).includes("E_PARTS_INVOICE_LINK_REQUIRED");
      await client.query("ROLLBACK TO SAVEPOINT verify_parts_required");
    }
    if (!partsRequiredFailed) throw new Error("Expected parts links requirement to fail for IS WO");

    await client.query(`UPDATE maintenance.work_orders SET labor_only_no_parts = true, v5_suffix = 'LABOR' WHERE id = $1`, [intWoId]);
    await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [intWoId]);

    await client.query(`DELETE FROM maintenance.work_orders WHERE id = ANY($1::uuid[])`, [[extWoId, intWoId]]);
    await client.query("COMMIT");
    console.log("PASS: WO completion guards validated for ES and IS flow.");
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
