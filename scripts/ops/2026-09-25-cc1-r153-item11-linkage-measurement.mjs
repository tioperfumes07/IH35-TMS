/**
 * ROUND 153 item 11 — linkage on every record, both ways. Measures every "no ..." count the Lead's
 * own item 11 names, live against production. Read-only; no AUTH-<NNN> needed.
 *
 * WHY THIS IS MEASUREMENT-ONLY, NOT A BACKFILL, THIS PASS: docs/LAW.md states, twice, in capitals:
 * "The 27,070 frozen-entity expenses carrying no truck, no load and no driver on any row are the
 * demonstration of what retrofitting costs" and "There is no USMCA backfill of any kind — not
 * expenses, not tours, not lanes." Both lines sit inside the SAME paragraph about NEVER importing
 * IH35 Transportation, LLC's historical AlwaysTrack exports into USMCA -- and LAW.md itself
 * separately confirms the 27,070 frozen rows are "every one of them Transportation," not USMCA's
 * 373. The narrower, most likely correct reading is: never import Transportation's legacy data into
 * USMCA -- not a ban on completing a USMCA expense's own unit_id/driver_uuid/trailer_id FROM that
 * SAME expense's own already-linked USMCA load (self-referential, same-entity, the exact Rung-2
 * resolution expenses.routes.ts's own PATCH handler already performs for every NEW expense). But
 * the law's own wording ("of any kind") is broad enough that a wrong read here would violate a
 * real, capitalized, twice-stated owner law -- DECISION NEEDED posted to NOW-CC-1.md rather than
 * acting on a confident-but-unconfirmed interpretation. No write happens in this pass.
 *
 * MEASURED LIVE (see printed output for the exact figures):
 *   mdata.loads (114 live, non-voided/cancelled): no_unit=27, no_driver=0, no_trailer=0,
 *     no_customer=0 — matches the Lead's own 07:46Z measurement (27) exactly; no drift.
 *   accounting.expenses (373 live): no_load=0 (every expense already carries its load — the
 *     self-referential backfill above would use exactly this), no_unit=112, no_driver=66,
 *     no_trailer=293 (was 305 at 07:46Z -- some concurrent progress already, not mine).
 *   fuel.fuel_transactions (458 live): no_unit=161, no_trailer=326 -- fuel.* is CC-2's lane per
 *     docs/bus/LANES.md; not investigated further here, reported only.
 *   driver_finance.driver_bills (114 live): no_settlement=9 (was 19 at 07:46Z -- real progress,
 *     likely this session's own item-1/item-7/item-8 work landing loads/documents correctly).
 */
import pg from "pg";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const loads = await client.query(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE assigned_unit_id IS NULL)::int AS no_unit,
       count(*) FILTER (WHERE assigned_primary_driver_id IS NULL)::int AS no_driver,
       count(*) FILTER (WHERE load_trailer_equipment_id IS NULL)::int AS no_trailer,
       count(*) FILTER (WHERE customer_id IS NULL)::int AS no_customer
       FROM mdata.loads WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status NOT IN ('cancelled', 'voided')`,
    [USMCA_ID]
  );
  console.log("mdata.loads:", JSON.stringify(loads.rows[0]));

  const expenses = await client.query(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE load_id IS NULL)::int AS no_load,
       count(*) FILTER (WHERE unit_id IS NULL)::int AS no_unit,
       count(*) FILTER (WHERE driver_uuid IS NULL)::int AS no_driver,
       count(*) FILTER (WHERE trailer_id IS NULL)::int AS no_trailer
       FROM accounting.expenses WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
    [USMCA_ID]
  );
  console.log("accounting.expenses:", JSON.stringify(expenses.rows[0]));

  const fuel = await client.query(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE unit_id IS NULL)::int AS no_unit,
       count(*) FILTER (WHERE trailer_id IS NULL)::int AS no_trailer
       FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid`,
    [USMCA_ID]
  );
  console.log("fuel.fuel_transactions (CC-2's lane, report only):", JSON.stringify(fuel.rows[0]));

  const bills = await client.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE settled_in_settlement_id IS NULL)::int AS no_settlement
       FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
    [USMCA_ID]
  );
  console.log("driver_finance.driver_bills:", JSON.stringify(bills.rows[0]));

  await client.query("ROLLBACK");
  await client.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
