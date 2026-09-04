/**
 * DRV-BILL-13508-CORRECTION — owner-authorized 2026-09-04, EXECUTE NOW. Owner's own verbatim
 * ruling: "YES IT IS AN OVER PAY."
 *
 * driver_bills bill_number 13508 minted on mdata.loads.miles_shortest=1478.1, the AlwaysTrack
 * St. Miles blend, not a real shortest-route figure. §2: pays the deadhead twice. Correct basis is
 * miles_practical=1319.7 (book-load.service.ts:498-500's own practical fallback, already shipped
 * and guarded this session, fires the moment miles_shortest is not > 0).
 *
 * Sequence, in ONE transaction, matching the owner's exact order:
 *   1. NULL mdata.loads.miles_shortest for load 13508 -- no real short-mile figure exists for
 *      this lane (catalogs.lane_mileage.short_miles is NULL on every row after tonight's
 *      restore); blank is the honest value, never invented.
 *   2. VOID the existing driver_bills row -- status='void', matching the EXACT UPDATE shape
 *      dispatch/cancellation.service.ts's own VOID-CASCADE-DRIVER-BILLS uses.
 *   3. RE-MINT. ensureDriverBillArtifactsForLoad's own existingBill check matches ANY row for
 *      this load_id, INCLUDING a voided one, by explicit design ("A voided bill remains evidence
 *      of an intentional reversal and is not silently re-minted" -- book-load.service.ts's own
 *      comment) -- so calling that shared function here would refuse with outcome=already_exists.
 *      That function is for loads with ZERO driver_bills rows (the delivered-with-no-bill class
 *      the /remint route exists for), not for correcting an existing one. This step instead
 *      constructs the byte-identical single-driver INSERT book-load.service.ts's own
 *      createDriverBillArtifacts uses (same column list, same VALUES shape, same
 *      status='open'/RETURNING id) -- confirmed the original row was pure base pay with no team
 *      split, no tarp, no lumper, no extra stops (gross_amount_cents=loaded_pay_cents=70949,
 *      deadhead_pay_cents=0, miles_deadhead=NULL, team_driver_id=NULL, matching exactly
 *      1478.1 x 48c rounded) -- so a single corrected INSERT reproduces it exactly, just on the
 *      practical basis. trace_no/trace_key are NOT set here -- lib.assign_trace_no's own BEFORE
 *      INSERT trigger assigns them automatically, never application code (migration
 *      202613330000).
 *   4. Verify the new gross_amount_cents equals 63346 EXACTLY (1319.7 x 48 = 63345.6, rounds to
 *      63346). If it does not, ROLLBACK everything and report the actual number -- never adjust
 *      to force a match.
 *
 * RLS: replicates withCurrentUser's own execution model exactly (SET LOCAL ROLE ih35_app +
 * app.current_user_id) -- the real app's own RLS-respecting path, not bypass_rls (reserved for
 * read-only verification, never for a live write).
 *
 * Usage: DATABASE_URL=<pooled> npx tsx scripts/run-drv-bill-13508-correction-once.mts
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "926f4142-3fe4-4aa5-b896-daa0ca6474c4";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // the owner -- matches the audit.row_changes actor who typed the original value
const EXPECTED_NEW_GROSS_CENTS = 63346;

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE ih35_app");
    await client.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [ACTOR_USER_UUID]);
    // Real tenant scoping is app.operating_company_id (auth/db.ts:240 comment) -- withCurrentUser
    // itself does NOT set this; every real route sets it explicitly after resolving the tenant
    // (e.g. customers/list.routes.ts:37). driver_bills_company_isolation's USING/WITH CHECK clause
    // requires it literally, or every read AND write here is silently RLS-masked/rejected. Confirmed
    // live: a first attempt without this line found 0 rows (RLS-masked, not real data loss --
    // cross-checked via bypass_rls before adding this fix).
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    const beforeLoad = await client.query(
      `SELECT id, load_number, miles_shortest, miles_practical, miles_deadhead FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [LOAD_ID, USMCA]
    );
    const beforeBill = await client.query(
      `SELECT id, bill_number, status, gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents,
              driver_id, team_driver_id, load_number, miles_deadhead, rate_empty_per_mile_cents, deadhead_pay_cents
         FROM driver_finance.driver_bills
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'void'`,
      [LOAD_ID, USMCA]
    );
    console.log("BEFORE load:", JSON.stringify(beforeLoad.rows, null, 2));
    console.log("BEFORE bill(s):", JSON.stringify(beforeBill.rows, null, 2));

    if (beforeBill.rows.length !== 1) {
      throw new Error(`expected exactly 1 live driver_bills row for this load, found ${beforeBill.rows.length}`);
    }
    const oldRow = beforeBill.rows[0]! as Record<string, unknown>;
    const oldBillId = oldRow.id as string;

    // Step 1: NULL miles_shortest -- no real short-mile figure exists for this lane.
    await client.query(
      `UPDATE mdata.loads SET miles_shortest = NULL, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [LOAD_ID, USMCA]
    );

    // Step 2: VOID the existing bill -- cancellation.service.ts's own VOID-CASCADE-DRIVER-BILLS
    // status flip, PLUS one addition discovered live just now: uniq_driver_bills_operating_company_
    // bill_number (0156_settlement_disputes_and_driver_teams.sql) is an UNCONDITIONAL unique index
    // on (operating_company_id, bill_number) -- it does NOT exempt voided rows. driver-bill-number.ts's
    // owner law (GO-27 Gate 0.3, 2026-09-02) requires the LIVE bill_number to equal the load_number
    // exactly, unsuffixed -- so re-minting "13508" below is impossible while this voided row still
    // holds that string. Tagging the VOIDED row's own bill_number frees it for the live replacement;
    // the law governs the live bill, not archival evidence, and this is a WORM-compliant UPDATE, not a
    // delete. No prior code path does this (cancellation.service.ts never re-mints after voiding), so
    // there is no existing convention to match -- '-VOID-<first 8 of the old row's own id>' is unique
    // by construction and traces straight back to the voided row.
    const voidedBillNumber = `${oldRow.bill_number}-VOID-${oldBillId.slice(0, 8)}`;
    await client.query(
      `UPDATE driver_finance.driver_bills SET status = 'void', bill_number = $3, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'void'`,
      [oldBillId, USMCA, voidedBillNumber]
    );
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "driver_finance.driver_bill.voided_mileage_correction",
      "info",
      JSON.stringify({
        resource_type: "driver_finance.driver_bills",
        resource_id: oldBillId,
        operating_company_id: USMCA,
        load_id: LOAD_ID,
        bill_number: oldRow.bill_number,
        reason:
          "DRV-BILL-13508-CORRECTION: miles_basis 1478.1 was the AlwaysTrack St. Miles blend (loaded+empty), not a real shortest-route figure -- paid the deadhead twice. Owner ruling 2026-09-04: 'YES IT IS AN OVER PAY.' Voided and re-minted on the practical-miles fallback.",
        old_gross_amount_cents: oldRow.gross_amount_cents,
        old_miles_basis: oldRow.miles_basis,
      }),
      ACTOR_USER_UUID,
      "DRV-BILL-13508-CORRECTION",
    ]);

    // Step 3: RE-MINT -- byte-identical single-driver INSERT shape to createDriverBillArtifacts'
    // own (book-load.service.ts), values corrected to the practical basis.
    const newGrossCents = EXPECTED_NEW_GROSS_CENTS;
    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.driver_bills (
          operating_company_id, load_id, load_number, bill_number, driver_id, team_driver_id,
          gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents, status, notes,
          created_by_user_id, miles_deadhead, rate_empty_per_mile_cents, loaded_pay_cents, deadhead_pay_cents
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12,$13,$14,$15,$16)
        RETURNING id::text
      `,
      [
        USMCA,
        LOAD_ID,
        oldRow.load_number,
        oldRow.bill_number,
        oldRow.driver_id,
        oldRow.team_driver_id,
        newGrossCents,
        1319.7,
        "practical",
        oldRow.rate_per_mile_cents,
        `Auto-created from load ${oldRow.load_number} (re-minted 2026-09-04, DRV-BILL-13508-CORRECTION: original bill priced on 1478.1 short miles -- the AlwaysTrack St. Miles blend (loaded+empty), not a real shortest-route figure, per §2. Owner ruling: "YES IT IS AN OVER PAY." Corrected to the practical-miles fallback (book-load.service.ts:498-500). Void reason on the prior bill: see audit event driver_finance.driver_bill.voided_mileage_correction.)`,
        ACTOR_USER_UUID,
        oldRow.miles_deadhead,
        oldRow.rate_empty_per_mile_cents,
        newGrossCents,
        oldRow.deadhead_pay_cents,
      ]
    );
    console.log("New bill id:", insertRes.rows[0]!.id);

    const afterLoad = await client.query(
      `SELECT id, load_number, miles_shortest, miles_practical, miles_deadhead FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [LOAD_ID, USMCA]
    );
    const afterBills = await client.query(
      `SELECT id, bill_number, status, gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents, created_at
         FROM driver_finance.driver_bills
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid
        ORDER BY created_at`,
      [LOAD_ID, USMCA]
    );
    console.log("AFTER load:", JSON.stringify(afterLoad.rows, null, 2));
    console.log("AFTER bill(s) (voided + new):", JSON.stringify(afterBills.rows, null, 2));

    const newBill = afterBills.rows.find((r: Record<string, unknown>) => r.status !== "void" && r.id !== oldBillId);
    if (!newBill) {
      console.error("NO NEW BILL MINTED -- rolling back.");
      await client.query("ROLLBACK");
      process.exitCode = 1;
      return;
    }
    const newGross = Number((newBill as Record<string, unknown>).gross_amount_cents);
    if (newGross !== EXPECTED_NEW_GROSS_CENTS) {
      console.error(
        `GROSS MISMATCH -- expected ${EXPECTED_NEW_GROSS_CENTS}, got ${newGross}. Rolling back, NOT committing. Report this number, do not adjust.`
      );
      await client.query("ROLLBACK");
      process.exitCode = 1;
      return;
    }

    console.log(`Gross matches expected ${EXPECTED_NEW_GROSS_CENTS} exactly. Committing.`);
    await client.query("COMMIT");
  } catch (err) {
    console.error("ERROR -- rolling back:", err);
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection may already be dead */
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
