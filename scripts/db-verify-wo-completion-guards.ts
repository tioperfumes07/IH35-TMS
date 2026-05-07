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
      `
        INSERT INTO mdata.units (unit_number, vin, make, model, year, status, owner_company_id, currently_leased_to_company_id)
        VALUES ('WG-${to_char(now(),'HH24MISS')}', md5(random()::text), 'KW', 'T680', 2020, 'active', $1, $1)
        RETURNING id
      `,
      [companyId]
    );
    const unitId = unitRes.rows[0].id;

    const vendorRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.vendors (vendor_name, vendor_code, vendor_type, operating_company_id)
        VALUES ('Verify Vendor', md5(random()::text), 'maintenance', $1)
        RETURNING id
      `,
      [companyId]
    );
    const vendorId = vendorRes.rows[0].id;

    const extNext = await client.query<{ display_id: string; sequence: number }>(
      `SELECT display_id, sequence FROM maintenance.next_wo_display_id($1, 'ES', CURRENT_DATE, $2)`,
      [unitId, companyId]
    );
    const extWoRes = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.work_orders (
          operating_company_id, unit_id, source_type, unit_sequence, status, wo_type, display_id,
          total_actual_cost, external_vendor_id, external_vendor_wo_number, external_vendor_invoice_number
        ) VALUES ($1,$2,'ES',$3,'open','repair',$4,10000,$5,'WO-X','INV-X')
        RETURNING id
      `,
      [companyId, unitId, extNext.rows[0].sequence, extNext.rows[0].display_id, vendorId]
    );
    const extWoId = extWoRes.rows[0].id;

    let missingCostReconFailed = false;
    try {
      await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [extWoId]);
    } catch (error) {
      missingCostReconFailed = String((error as Error).message).includes("E_COST_RECONCILIATION_FAILED");
    }
    if (!missingCostReconFailed) throw new Error("Expected E_COST_RECONCILIATION_FAILED when invoice amount missing");

    let mismatchFailed = false;
    await client.query(`UPDATE maintenance.work_orders SET external_vendor_invoice_amount = 10050 WHERE id = $1`, [extWoId]);
    try {
      await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [extWoId]);
    } catch (error) {
      mismatchFailed = String((error as Error).message).includes("E_COST_RECONCILIATION_FAILED");
    }
    if (!mismatchFailed) throw new Error("Expected mismatch > $0.01 to fail");

    await client.query(`UPDATE maintenance.work_orders SET external_vendor_invoice_amount = 10000, v5_suffix = 'ABCDE' WHERE id = $1`, [extWoId]);
    await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [extWoId]);

    const intNext = await client.query<{ display_id: string; sequence: number }>(
      `SELECT display_id, sequence FROM maintenance.next_wo_display_id($1, 'IS', CURRENT_DATE, $2)`,
      [unitId, companyId]
    );
    const intWoRes = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.work_orders (
          operating_company_id, unit_id, source_type, unit_sequence, status, wo_type, display_id, total_actual_cost, labor_only_no_parts
        ) VALUES ($1,$2,'IS',$3,'open','repair',$4,5000,false)
        RETURNING id
      `,
      [companyId, unitId, intNext.rows[0].sequence, intNext.rows[0].display_id]
    );
    const intWoId = intWoRes.rows[0].id;

    let partsRequiredFailed = false;
    try {
      await client.query(`UPDATE maintenance.work_orders SET v5_suffix = 'ABCDE', status = 'completed' WHERE id = $1`, [intWoId]);
    } catch (error) {
      partsRequiredFailed = String((error as Error).message).includes("E_PARTS_INVOICE_LINK_REQUIRED");
    }
    if (!partsRequiredFailed) throw new Error("Expected parts links requirement to fail for IS WO");

    await client.query(`UPDATE maintenance.work_orders SET labor_only_no_parts = true, v5_suffix = 'LABOR' WHERE id = $1`, [intWoId]);
    await client.query(`UPDATE maintenance.work_orders SET status = 'completed' WHERE id = $1`, [intWoId]);

    await client.query(`DELETE FROM maintenance.work_orders WHERE id = ANY($1::uuid[])`, [[extWoId, intWoId]]);
    await client.query(`DELETE FROM mdata.vendors WHERE id = $1`, [vendorId]);
    await client.query(`DELETE FROM mdata.units WHERE id = $1`, [unitId]);

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
