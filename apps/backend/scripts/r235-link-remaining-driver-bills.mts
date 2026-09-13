#!/usr/bin/env node
/**
 * ROUND 23.5 — close out the "2 driver bills remain with settled_in_settlement_id NULL" item.
 *
 * Live-measured: 4 open USMCA-or-TRANSP driver_bills rows have settled_in_settlement_id NULL.
 * 2 are TRANSP (L-20260616-0120, L-20260627-0036) -- out of this round's USMCA scope, untouched.
 * 2 are USMCA: bill 13571 ($822.74) and bill 13574 ($780.61), both driver 3e138476-06db-4b08-9ebe-
 * 527a5d8c591d (both loads' own assigned_primary_driver_id matches exactly, both loads status=
 * closed). driver_finance.driver_settlements S-2026-5799 (id afe1e6c0-f368-4b7d-b408-e75bbfea250d,
 * status=locked, same driver) has first_load_number=13571 and last_load_number=13574 -- an exact
 * bookend match on the settlement's OWN recorded range, not a guess. That settlement currently has
 * ZERO driver_bills linked to it at all -- the same B3/B6 ingestion-time linkage gap already
 * diagnosed elsewhere this session (driver_bills not populated/linked for several USMCA
 * settlements), not something this script invents.
 *
 * LINK ONLY -- sets settled_in_settlement_id on the two bills. No GL/money recompute: S-2026-5799's
 * own gross_pay/net_pay were already fixed to match its signed AllwaysTrack document by the B4
 * backfill (r232-backfill-settlement-header-from-posted-je.mts) earlier this session and are left
 * untouched here.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r235-link-remaining-driver-bills.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r235-link-remaining-driver-bills.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const SETTLEMENT_5799_ID = "afe1e6c0-f368-4b7d-b408-e75bbfea250d"; // S-2026-5799
const BILL_13571_ID = "6ce5d386-534f-407e-a9c0-3237a040e6a3";
const BILL_13574_ID = "63fbefc8-37a7-42b5-ae08-70e39271c5d6";

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

    // Refuse to touch anything that isn't exactly the verified state.
    const { rows: settlement } = await client.query(
      `SELECT id, display_id, driver_id, status, first_load_number, last_load_number
         FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
      [SETTLEMENT_5799_ID]
    );
    if (settlement.length !== 1 || settlement[0].first_load_number !== "13571" || settlement[0].last_load_number !== "13574") {
      throw new Error(`Settlement shape changed, refusing: ${JSON.stringify(settlement)}`);
    }
    const driverId = settlement[0].driver_id as string;

    const { rows: bills } = await client.query(
      `SELECT id, bill_number, load_number, driver_id, settled_in_settlement_id, status
         FROM driver_finance.driver_bills WHERE id IN ($1::uuid,$2::uuid) ORDER BY bill_number`,
      [BILL_13571_ID, BILL_13574_ID]
    );
    console.log("bills before:", JSON.stringify(bills, null, 2));
    for (const bill of bills) {
      if (bill.settled_in_settlement_id !== null) {
        throw new Error(`Bill ${bill.bill_number} already linked to ${bill.settled_in_settlement_id} -- refusing to overwrite.`);
      }
      if (bill.driver_id !== driverId) {
        throw new Error(`Bill ${bill.bill_number} driver ${bill.driver_id} does not match settlement driver ${driverId} -- refusing.`);
      }
    }

    await client.query(
      `UPDATE driver_finance.driver_bills SET settled_in_settlement_id = $2::uuid, updated_at = now()
        WHERE id IN ($1::uuid, $3::uuid)`,
      [BILL_13571_ID, SETTLEMENT_5799_ID, BILL_13574_ID]
    );
    console.log(`linked bills 13571 and 13574 -> settlement ${settlement[0].display_id} (${SETTLEMENT_5799_ID})`);

    const { rows: after } = await client.query(
      `SELECT bill_number, settled_in_settlement_id FROM driver_finance.driver_bills WHERE id IN ($1::uuid,$2::uuid) ORDER BY bill_number`,
      [BILL_13571_ID, BILL_13574_ID]
    );
    console.log("after:", JSON.stringify(after, null, 2));

    const { rows: remaining } = await client.query(
      `SELECT bill_number, load_number, operating_company_id FROM driver_finance.driver_bills
        WHERE settled_in_settlement_id IS NULL AND status = 'open' AND operating_company_id = $1::uuid`,
      [OPCO]
    );
    console.log(`remaining USMCA open bills with no settlement link: ${remaining.length}`, JSON.stringify(remaining));
    if (remaining.length !== 0) throw new Error("Expected 0 remaining USMCA unlinked bills after this fix.");

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
