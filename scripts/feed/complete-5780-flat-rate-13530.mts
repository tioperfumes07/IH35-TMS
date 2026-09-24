#!/usr/bin/env tsx
/**
 * Missing Flat Rate $150 on load 13530 (Driver Settlement 5780).
 * Signed PDF: 13530 + 13532 Flat Rate $150 each = TOTAL DUE $300.
 * 13532 already has the bill; 13530 was missing. Control had pay=0 (wrong).
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalDriverBill } from "../../apps/backend/src/driver-finance/historical-driver-bill-backfill.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRIVER = "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7"; // Rafael Rogelio Rivero Reynoso
const APPLY = process.argv.includes("--apply");

if (!APPLY) {
  console.log("DRY — --apply creates Flat Rate $150 bill on 13530");
  process.exit(0);
}
if (process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1");
}

await withCurrentUser(OWNER, async (c) => {
  await setScopedCompanyContext(c, OWNER, USMCA);
  const L = await c.query<{ id: string }>(
    `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number='13530' AND soft_deleted_at IS NULL LIMIT 1`,
    [USMCA]
  );
  if (!L.rows[0]) throw new Error("load 13530 missing");
  const bill = await createHistoricalDriverBill(c as never, {
    operating_company_id: USMCA,
    load_id: L.rows[0].id,
    load_number: "13530",
    driver_id: DRIVER,
    gross_amount_cents: 15000,
    loaded_pay_cents: 15000,
    deadhead_pay_cents: 0,
    source_document_ref: "5780",
    requesting_user_uuid: OWNER,
  });
  console.log(bill);
  const billId = bill.outcome === "created" || bill.outcome === "already_exists" ? bill.driver_bill_id : null;
  const settl = await c.query<{ id: string }>(
    `SELECT id::text FROM driver_finance.driver_settlements
      WHERE operating_company_id=$1::uuid AND source_document_ref='5780' AND voided_at IS NULL LIMIT 1`,
    [USMCA]
  );
  if (billId && settl.rows[0]) {
    const u = await c.query(
      `UPDATE driver_finance.driver_bills
          SET settled_in_settlement_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND settled_in_settlement_id IS NULL
        RETURNING id::text`,
      [settl.rows[0].id, billId]
    );
    console.log("linked_to_5780", u.rows);
  }
});
