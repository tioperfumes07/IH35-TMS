#!/usr/bin/env node
/**
 * ROUND 23.5 CORRECTED — close the two Faro-purchased invoices that carry no load link.
 * Owner ruling, relayed verbatim by the Lead 2026-09-13. Supersedes the original (uncorrected)
 * ROUND 23.5 box, which told CC-1 to create a SECOND MPH load — Cursor resolved MPH against the
 * source and it is the SAME load as AllwaysTrack 13524 (Faro PO MPHC261334 = load 13524, gross
 * $4,200, Faro funded $3,800). That box is dead; this script implements the corrected one only.
 *
 * ITEM 1 — MPH $3,800 (INV-2026-00008) -> EXISTING load 13524. LINK ONLY. No new load, no
 * un-void of the old $4,200 invoice/bill (forbidden by the owner's no-reverse law of 2026-09-13
 * 20:12). A NEW live driver bill is created (the old one stays voided, per convention: a load that
 * needs a live bill gets a new one, never a resurrected old one) and an under-billing dispute
 * records the $400 gap between what Faro paid ($3,800) and the load's own AllwaysTrack gross
 * ($4,200) -- the invoice itself is never written up or down.
 *
 * ITEM 2 — ITS $350 (INV-2026-00007) -> ONE genuinely new load. Confirmed absent everywhere (WO
 * 68747 returns 0 rows in the app on every number column; "ITS Logistics" appears on no AllwaysTrack
 * settlement document; no $300-$400 customer-charge line exists on any of the 44 documents). Owner
 * ruling, verbatim: "THEN THE 350 CREATE THE LOAD AND SETTLEMENT WITH THE INVOICE NUMBER AND I WILL
 * RECONCILE LATER." load_number = the invoice's own display_id, not a minted/AlwaysTrack number --
 * deliberately invoice-shaped so it can never be mistaken for a real AllwaysTrack load.
 *
 * NOT DONE, reported not guessed: the settlement for ITEM 2. driver_finance.driver_settlements.
 * driver_id is NOT NULL (schema-verified live) and the driver on this load is genuinely unknown --
 * WO 68747 returns 0 rows on every number column in the app, so there is no source anywhere to name
 * one. The owner's own instruction says "Driver unknown ... do not guess a driver" for the BILL; the
 * same law binds the settlement's driver_id, which the row cannot exist without. This script creates
 * the load and links the invoice/advance; it does NOT create a settlement for ITEM 2, and prints that
 * finding instead of inventing a driver.
 *
 * SAFE BY CONSTRUCTION: no reverses, no voids, no un-voids -- matches the owner's no-reverse law.
 * The one voided driver_bills row this touches (13524's old $853.61 bill) has its bill_number
 * TOMBSTONED ONLY (renamed so the unique index on (operating_company_id, bill_number) does not
 * collide with the new live bill) -- voided_at, status, and every other field on that row are left
 * exactly as they are. No GL math: this is load/invoice/bill/dispute LINKAGE only, the same pattern
 * used throughout this session for driver_bills tombstoning.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r235-faro-orphan-invoices-close.mts            # PREVIEW (default)
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r235-faro-orphan-invoices-close.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // dispatcher/system actor already used on every one of these rows (loads 13463/13475/13524/13525/13548, the two existing disputes)

// ITEM 1 — MPH $3,800 -> existing load 13524
const LOAD_13524_ID = "ab0c06d2-303d-4d44-933b-9a8cd748f4bc";
const LOAD_13524_DRIVER_ID = "3445cf68-4a7f-4d73-89f7-04bf1fd207b4"; // Hugo Gaytan, load 13524's own assigned_primary_driver_id
const INV_00008_USMCA_ID = "a0082f2b-2e28-446d-997c-ace6e23a6bc6"; // INV-2026-00008, USMCA row (display_id collides with an unrelated TRANSP invoice of the same number -- operating_company_id disambiguates)
const OLD_VOIDED_BILL_13524_ID = "502a7a35-3788-4b1c-a4fa-551cf753c930"; // $853.61, void, bill_number="13524"
const SETTLEMENT_S0011_ID = "c7edc017-9696-41c3-a3b0-bb0c903e0d07"; // S-2026-0011, tour 8b8cb2f2-df23-4de3-9ad1-205564bb0726 -- the SAME known-duplicate mega-row excluded from the B4 backfill; this script only attaches a bill to it, no GL/money recompute
const NEW_BILL_853_61_CENTS = 85361; // document 5778's own figure for this load, same as the voided bill

// ITEM 2 — ITS $350 -> one genuinely new load
const ITS_CUSTOMER_ID = "736e3124-8bc1-4ccd-973b-b97ecf0b92f8"; // ITS Logistics LLC, USMCA
const DRY_VAN_EQUIPMENT_ID = "cdfee422-66fd-4710-bd23-d2cf9ee3bf4d"; // catalogs.load_trailer_equipment, USMCA, same equipment code every one of these placeholder/AllwaysTrack loads uses
const INV_00007_USMCA_ID = "2da51e4f-b11a-41e6-b9c1-193c1c719d41"; // INV-2026-00007, USMCA row (same collision note as above)
const ITS_LOAD_NUMBER = "INV-2026-00007"; // owner ruling: the invoice number itself, not a minted or AlwaysTrack number
const ITS_RATE_CENTS = 35000; // $350.00
const ITS_WO_NUMBER = "68747";

const PLACEHOLDER_MEMO =
  "Placeholder number — Faro-purchased load never entered in AllwaysTrack. Owner to reconcile.";

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    console.log("=== ITEM 1 — MPH $3,800 (INV-2026-00008) -> existing load 13524, LINK ONLY ===\n");

    // Pre-state sanity: the invoice must exist, be USMCA, unvoided, and not already linked.
    const { rows: invBefore } = await client.query(
      `SELECT id, display_id, status, total_cents, source_load_id, factoring_advance_id
         FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [INV_00008_USMCA_ID, OPCO]
    );
    if (invBefore.length !== 1) throw new Error("INV-2026-00008 (USMCA) not found — aborting, not guessing.");
    if (invBefore[0].source_load_id) {
      throw new Error(`INV-2026-00008 already has source_load_id=${invBefore[0].source_load_id} — refusing to overwrite.`);
    }
    console.log(`  invoice before: ${JSON.stringify(invBefore[0])}`);

    // 1. Link the invoice to load 13524.
    await client.query(
      `UPDATE accounting.invoices SET source_load_id = $2::uuid, updated_at = now()
        WHERE id = $1::uuid`,
      [INV_00008_USMCA_ID, LOAD_13524_ID]
    );
    console.log("  [1] linked INV-2026-00008.source_load_id -> load 13524");

    // 2. Faro advance FAC-2026-00114 is ALREADY attached (factoring_advance_id already set,
    //    live-verified before this script ran) -- nothing to write, verify only.
    const { rows: advCheck } = await client.query(
      `SELECT fa.display_id FROM accounting.invoices i
         JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
        WHERE i.id = $1::uuid`,
      [INV_00008_USMCA_ID]
    );
    if (advCheck.length !== 1 || advCheck[0].display_id !== "FAC-2026-00114") {
      throw new Error(`Expected FAC-2026-00114 already attached to INV-2026-00008, found: ${JSON.stringify(advCheck)}`);
    }
    console.log(`  [2] Faro advance already attached: ${advCheck[0].display_id} (no write needed)`);

    // 3. Open the under-billing dispute: invoiced 3,800 vs the load's own AllwaysTrack gross 4,200.
    const { rows: dupDispute } = await client.query(
      `SELECT id FROM accounting.invoice_disputes WHERE invoice_id = $1::uuid AND status = 'open'`,
      [INV_00008_USMCA_ID]
    );
    if (dupDispute.length > 0) {
      console.log(`  [3] dispute already open on this invoice (${dupDispute[0].id}) — skipping, not duplicating`);
    } else {
      const { rows: disputeIns } = await client.query(
        `INSERT INTO accounting.invoice_disputes
           (operating_company_id, invoice_id, customer_id, disputed_amount_cents,
            invoiced_amount_cents, expected_amount_cents, reason_code, reason_text,
            opened_by_user_id, source_system)
         SELECT $1::uuid, $2::uuid, i.customer_id, 40000, 380000, 420000, 'under_billing',
                'ROUND 23.5: Faro purchased load 13524 at $3,800 (INV-2026-00008); the load''s own ' ||
                'AllwaysTrack gross is $4,200 (document 5778). Invoice stays at $3,800 -- owner ' ||
                'decides whether to re-bill the $400 delta.',
                $3::uuid, 'api'
           FROM accounting.invoices i WHERE i.id = $2::uuid
         RETURNING id`,
        [OPCO, INV_00008_USMCA_ID, ACTOR_USER_ID]
      );
      console.log(`  [3] opened under-billing dispute ${disputeIns[0].id}: invoiced 3,800.00 / expected 4,200.00 / disputed 400.00`);
    }

    // 4. Tombstone the OLD voided bill's bill_number only (stays voided, every other field
    //    untouched) so the unique index on (operating_company_id, bill_number) does not collide,
    //    then create a NEW live bill at $853.61 -- the figure document 5778 prints for this load,
    //    the same figure the voided bill carried. The voided bill is never un-voided.
    const { rows: oldBillBefore } = await client.query(
      `SELECT id, bill_number, status, voided_at, gross_amount_cents FROM driver_finance.driver_bills WHERE id = $1::uuid`,
      [OLD_VOIDED_BILL_13524_ID]
    );
    if (oldBillBefore.length !== 1 || oldBillBefore[0].status !== "void") {
      throw new Error(`Expected exactly one VOID bill at ${OLD_VOIDED_BILL_13524_ID}, found: ${JSON.stringify(oldBillBefore)}`);
    }
    await client.query(
      `UPDATE driver_finance.driver_bills
          SET bill_number = bill_number || '-VOID-' || left(id::text, 8), updated_at = now()
        WHERE id = $1::uuid AND status = 'void'`,
      [OLD_VOIDED_BILL_13524_ID]
    );
    console.log(`  [4a] tombstoned old voided bill ${OLD_VOIDED_BILL_13524_ID}'s bill_number (still void, untouched otherwise)`);

    const { rows: newBillIns } = await client.query(
      `INSERT INTO driver_finance.driver_bills
         (operating_company_id, load_id, load_number, bill_number, driver_id,
          gross_amount_cents, status, settled_in_settlement_id, notes)
       VALUES ($1::uuid, $2::uuid, '13524', '13524', $3::uuid, $4, 'open', $5::uuid,
               'ROUND 23.5: new live bill for load 13524 -- Faro purchased this load at $3,800 ' ||
               '(INV-2026-00008); this bill carries the load''s own $853.61 driver pay figure ' ||
               '(document 5778). The prior $853.61 bill stays voided, never resurrected.')
       RETURNING id, bill_number, gross_amount_cents, settled_in_settlement_id`,
      [OPCO, LOAD_13524_ID, LOAD_13524_DRIVER_ID, NEW_BILL_853_61_CENTS, SETTLEMENT_S0011_ID]
    );
    console.log(`  [4b] created new live bill ${newBillIns[0].id}: bill_number=${newBillIns[0].bill_number} gross=$${(newBillIns[0].gross_amount_cents / 100).toFixed(2)}`);

    // 5. Bill is linked to settlement S-2026-0011 at insert time (settled_in_settlement_id set
    //    above) -- no GL/money recompute on that settlement, pure linkage.
    console.log(`  [5] bill linked to settlement ${newBillIns[0].settled_in_settlement_id} (S-2026-0011, tour 8b8cb2f2-df23-4de3-9ad1-205564bb0726) — no GL/money recompute`);

    console.log("\n=== ITEM 2 — ITS $350 (INV-2026-00007) -> one genuinely new load ===\n");

    const { rows: invItsBefore } = await client.query(
      `SELECT id, display_id, status, total_cents, source_load_id, factoring_advance_id
         FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [INV_00007_USMCA_ID, OPCO]
    );
    if (invItsBefore.length !== 1) throw new Error("INV-2026-00007 (USMCA) not found — aborting, not guessing.");
    if (invItsBefore[0].source_load_id) {
      throw new Error(`INV-2026-00007 already has source_load_id=${invItsBefore[0].source_load_id} — refusing to overwrite.`);
    }
    console.log(`  invoice before: ${JSON.stringify(invItsBefore[0])}`);

    const { rows: dupLoad } = await client.query(
      `SELECT id FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2`,
      [OPCO, ITS_LOAD_NUMBER]
    );
    if (dupLoad.length > 0) {
      throw new Error(`A load with load_number=${ITS_LOAD_NUMBER} already exists (${dupLoad[0].id}) — refusing to create a duplicate.`);
    }

    const { rows: loadIns } = await client.query(
      `INSERT INTO mdata.loads
         (operating_company_id, load_number, customer_id, dispatcher_user_id, status,
          rate_total_cents, is_sample_data, customer_wo_number, load_trailer_equipment_id, notes)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, 'closed', $5, false, $6, $7::uuid, $8)
       RETURNING id, load_number, rate_total_cents`,
      [OPCO, ITS_LOAD_NUMBER, ITS_CUSTOMER_ID, ACTOR_USER_ID, ITS_RATE_CENTS, ITS_WO_NUMBER, DRY_VAN_EQUIPMENT_ID, PLACEHOLDER_MEMO]
    );
    const itsLoadId = loadIns[0].id as string;
    console.log(`  [load] created ${itsLoadId}: load_number=${loadIns[0].load_number} rate=$${(loadIns[0].rate_total_cents / 100).toFixed(2)}`);

    await client.query(
      `UPDATE accounting.invoices SET source_load_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
      [INV_00007_USMCA_ID, itsLoadId]
    );
    console.log(`  [invoice] linked INV-2026-00007.source_load_id -> ${itsLoadId}`);

    const { rows: advCheckIts } = await client.query(
      `SELECT fa.display_id FROM accounting.invoices i
         JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
        WHERE i.id = $1::uuid`,
      [INV_00007_USMCA_ID]
    );
    if (advCheckIts.length !== 1 || advCheckIts[0].display_id !== "FAC-2026-00113") {
      throw new Error(`Expected FAC-2026-00113 already attached to INV-2026-00007, found: ${JSON.stringify(advCheckIts)}`);
    }
    console.log(`  [advance] already attached: ${advCheckIts[0].display_id} (no write needed)`);

    console.log(
      "\n  [settlement] NOT CREATED — driver_finance.driver_settlements.driver_id is NOT NULL " +
        "(schema-verified) and the driver on this load is genuinely unknown: WO 68747 returns 0 " +
        "rows on every number column anywhere in the app, so there is no source to name one from. " +
        "The owner's 'do not guess a driver' instruction binds this row the same way it binds the " +
        "driver bill. Reporting this, not inventing a driver."
    );
    console.log("  [driver bill] NOT CREATED — same reason (driver unknown).");

    if (commit) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nPREVIEW ONLY -- rolled back. Re-run with --commit to persist.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
