/**
 * ROUND 23.4 B7 (owner, 2026-09-13): "cutover-flag fixes" for 7 named USMCA loads that were
 * seeded with is_sample_data=true (and, for 13579, an illegal is_sample_data=true + status=
 * 'invoiced' combo) despite being real, signed-document-verified economic history. Ground truth
 * = data/alwaystrack/settlements-truth-2026-09-13.json, cross-checked against the ticket's own
 * per-load dollar figures -- both agree exactly.
 *
 * SCOPE (deliberately narrow -- see REMAINING in the OUTBOX post for what this does NOT do):
 *   1. mdata.loads.is_sample_data: true -> false, all 7 loads.
 *   2. mdata.loads.rate_total_cents: 13579 only, $4,650.00 -> $4,900.00 (465000 -> 490000 cents;
 *      a plain data-entry error, confirmed against both the ticket and the ground-truth JSON's
 *      doc 5802 customer_charges entry -- not a GL posting, just a load attribute).
 *   3. accounting.invoices.is_sample_data: 13579's invoice only, true -> false (the other 6
 *      invoices are already false).
 *   4. driver_finance.driver_bills: 13509 and 13579 only. Their gross_amount_cents disagreed with
 *      the ticket ($1,011.90 live vs $960.35 ticket; $538.51 live vs $945.10 ticket). Root cause,
 *      cross-checked against ground truth's driver pay_lines:
 *        - 13509 double-counted the empty-miles leg: loaded_pay_cents already held the CORRECT
 *          $960.35 (loaded 1813.3mi + empty 107.4mi, both @ $0.50/mi, per doc 5770's pay_lines),
 *          but a separate deadhead_pay_cents of $51.55 (107.4mi @ a different $0.48/mi) was ALSO
 *          added on top, and rate_per_mile_cents/miles_basis were blended across both legs
 *          (53c/mi, 1920.7mi) instead of reflecting either leg on its own. Fixed to the doc's own
 *          two line items: loaded_pay_cents=$906.65 (1813.3mi @ $0.50), deadhead_pay_cents=$53.70
 *          (107.4mi @ $0.50), gross=$960.35.
 *        - 13579 used a GPS-derived "short" mileage (1121.9mi @ 48c/mi = $538.51) instead of the
 *          signed settlement doc's own printed practical mileage (1890.2mi @ $0.50/mi = $945.10,
 *          doc 5802's only pay line) -- exactly the "no GPS recompute" instruction. Fixed to the
 *          doc's printed figure.
 *      All 5 other driver bills (13497/13498/13503/13504/13506) already matched the ticket
 *      exactly and are left untouched.
 *
 *   5. driver_finance.driver_settlements.status: 'cancelled' -> 'closed' (+ trip_closed_at stamped
 *      to the settlement's own period_end when not already set) for the two tours these 7 loads
 *      sit on that CC-2's re-cut found stuck: S-2026-0019 (13569/13577, doc 5797, period ended
 *      2026-09-05) and S-2026-0025 (13579, doc 5802, period ended 2026-09-11). Root cause: the
 *      real close-tour flow (stampTripClosedForBookendedSettlement) explicitly REFUSES to close a
 *      'cancelled' settlement (`if (row.voided_at || row.status === "cancelled") return { reason:
 *      "cancelled" }`), and buildTourReadout's own is_open formula treats any non-'open' status as
 *      already closed -- so a settlement wrongly left at 'cancelled' (same origin as the is_sample_
 *      data mis-seed above) is neither closeable through the real endpoint nor honestly "open"; it
 *      is just stuck. A load on a signed, closed settlement document is not in motion, so this
 *      moves the state FORWARD to 'closed' -- the same status value 9 other real closed tours in
 *      this table already carry -- never backward through void. Settlement lines already exist for
 *      both settlements (7 and 3 rows respectively), so this does not touch
 *      appendEarningsForAnchor's line-backfill path; only the status/trip_closed_at fields a human
 *      closing this tour would have set are touched.
 *
 * NOT done here (flagged in the OUTBOX post as open questions, not silently skipped):
 *   - All 7 loads' invoices/driver-bills, and every existing fuel expense row for 6 of the 7
 *     loads, are status='void' (13579's driver bill is 'open', its invoice is a $0 shell with no
 *     lines). void.service.ts has no "unvoid" primitive anywhere in this codebase -- void is a
 *     one-way WORM action here, same as void-never-delete for deletes. Flipping these back to a
 *     live status with raw SQL would be inventing a code path that does not exist and bypassing
 *     postVoidReversal's own GL bookkeeping. That decision (reuse of a real posting flow to bring
 *     this revenue/pay/fuel history current, vs. leaving the void rows as historical record and
 *     creating fresh ones through the product UI/API per the HUMAN-SEQUENCE-REPLAY "no bulk SQL
 *     insert" precedent) is left to the Lead/owner.
 *   - 13497's fuel expense rows are each present as exactly 3 duplicate accounting.expenses
 *     headers (same date/vendor/amount, 3x), all void. This pre-dates this script and is a B2
 *     ingest-duplication defect, not a B7 cutover-flag issue -- reported, not touched.
 *   - 13579 has zero fuel expense rows at all (ground truth: 2 receipts, $1,491.70). Ingesting
 *     them is part of the ~136-line B2 sweep, not this narrow flag fix.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-b7-usmca-cutover-flags-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-b7-usmca-cutover-flags-once.mts --commit  # apply
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const LOAD_NUMBERS = ["13497", "13498", "13503", "13504", "13506", "13509", "13579"];

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    // --- 1. is_sample_data on all 7 loads -----------------------------------------------------
    const loads = await client.query(
      `SELECT id, load_number, is_sample_data, rate_total_cents, status
         FROM mdata.loads
        WHERE load_number = ANY($1::text[]) AND operating_company_id = $2::uuid`,
      [LOAD_NUMBERS, USMCA]
    );
    if (loads.rows.length !== 7) {
      throw new Error(`expected 7 loads under USMCA, found ${loads.rows.length}`);
    }
    for (const row of loads.rows) {
      console.log(
        `FOUND load ${row.load_number}: is_sample_data=${row.is_sample_data} rate_total_cents=${row.rate_total_cents} status=${row.status}`
      );
    }

    const flippedLoads = await client.query(
      `UPDATE mdata.loads
          SET is_sample_data = false, updated_at = now()
        WHERE load_number = ANY($1::text[]) AND operating_company_id = $2::uuid AND is_sample_data = true
        RETURNING load_number`,
      [LOAD_NUMBERS, USMCA]
    );
    console.log(`is_sample_data flipped false on: ${flippedLoads.rows.map((r) => r.load_number).join(", ") || "(none -- already false)"}`);

    // --- 2. 13579 rate_total_cents -------------------------------------------------------------
    const load13579 = loads.rows.find((r) => r.load_number === "13579");
    if (!load13579) throw new Error("13579 not found");
    if (Number(load13579.rate_total_cents) === 465000) {
      await client.query(`UPDATE mdata.loads SET rate_total_cents = 490000, updated_at = now() WHERE id = $1`, [load13579.id]);
      console.log("13579 rate_total_cents corrected: 465000 -> 490000 ($4,650.00 -> $4,900.00)");
    } else if (Number(load13579.rate_total_cents) === 490000) {
      console.log("13579 rate_total_cents already 490000 -- nothing to do.");
    } else {
      throw new Error(`13579 rate_total_cents is ${load13579.rate_total_cents}, neither the known-wrong 465000 nor the target 490000 -- stopping.`);
    }

    // --- 3. 13579 invoice is_sample_data --------------------------------------------------------
    const inv = await client.query(
      `SELECT id, is_sample_data, status FROM accounting.invoices WHERE source_load_id = $1`,
      [load13579.id]
    );
    if (inv.rows.length !== 1) throw new Error(`expected exactly 1 invoice for 13579, found ${inv.rows.length}`);
    console.log(`FOUND 13579 invoice ${inv.rows[0].id}: is_sample_data=${inv.rows[0].is_sample_data} status=${inv.rows[0].status}`);
    if (inv.rows[0].is_sample_data === true) {
      await client.query(`UPDATE accounting.invoices SET is_sample_data = false, updated_at = now() WHERE id = $1`, [inv.rows[0].id]);
      console.log("13579 invoice is_sample_data flipped false.");
    } else {
      console.log("13579 invoice is_sample_data already false -- nothing to do.");
    }

    // --- 4. driver_bills correction: 13509 and 13579 -------------------------------------------
    const bills = await client.query(
      `SELECT db.id, l.load_number, db.gross_amount_cents, db.miles_basis, db.miles_basis_type,
              db.rate_per_mile_cents, db.miles_deadhead, db.rate_empty_per_mile_cents,
              db.loaded_pay_cents, db.deadhead_pay_cents
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id
        WHERE l.load_number IN ('13509', '13579') AND l.operating_company_id = $1::uuid`,
      [USMCA]
    );
    if (bills.rows.length !== 2) throw new Error(`expected 2 driver bills (13509, 13579), found ${bills.rows.length}`);

    for (const bill of bills.rows) {
      console.log(
        `FOUND driver bill ${bill.load_number}: gross=${bill.gross_amount_cents} miles_basis=${bill.miles_basis} ` +
          `basis_type=${bill.miles_basis_type} rate=${bill.rate_per_mile_cents} deadhead_mi=${bill.miles_deadhead} ` +
          `empty_rate=${bill.rate_empty_per_mile_cents} loaded_pay=${bill.loaded_pay_cents} deadhead_pay=${bill.deadhead_pay_cents}`
      );
    }

    const bill13509 = bills.rows.find((r) => r.load_number === "13509");
    const bill13579 = bills.rows.find((r) => r.load_number === "13579");
    if (!bill13509 || !bill13579) throw new Error("could not find both driver bills");

    if (Number(bill13509.gross_amount_cents) === 101190) {
      await client.query(
        `UPDATE driver_finance.driver_bills
            SET gross_amount_cents = 96035, miles_basis = 1813.3, miles_basis_type = 'practical',
                rate_per_mile_cents = 50, miles_deadhead = 107.4, rate_empty_per_mile_cents = 50,
                loaded_pay_cents = 90665, deadhead_pay_cents = 5370, updated_at = now()
          WHERE id = $1`,
        [bill13509.id]
      );
      console.log("13509 driver bill corrected: gross $1,011.90 -> $960.35 (doc 5770 pay_lines: 1813.3mi loaded + 107.4mi empty, both @ $0.50/mi).");
    } else if (Number(bill13509.gross_amount_cents) === 96035) {
      console.log("13509 driver bill already correct -- nothing to do.");
    } else {
      throw new Error(`13509 driver bill gross_amount_cents is ${bill13509.gross_amount_cents}, neither known-wrong 101190 nor target 96035 -- stopping.`);
    }

    if (Number(bill13579.gross_amount_cents) === 53851) {
      await client.query(
        `UPDATE driver_finance.driver_bills
            SET gross_amount_cents = 94510, miles_basis = 1890.2, miles_basis_type = 'practical',
                rate_per_mile_cents = 50, miles_deadhead = NULL, rate_empty_per_mile_cents = NULL,
                loaded_pay_cents = 94510, deadhead_pay_cents = 0, updated_at = now()
          WHERE id = $1`,
        [bill13579.id]
      );
      console.log("13579 driver bill corrected: gross $538.51 (GPS short-mile recompute) -> $945.10 (doc 5802's own printed 1890.2mi @ $0.50/mi).");
    } else if (Number(bill13579.gross_amount_cents) === 94510) {
      console.log("13579 driver bill already correct -- nothing to do.");
    } else {
      throw new Error(`13579 driver bill gross_amount_cents is ${bill13579.gross_amount_cents}, neither known-wrong 53851 nor target 94510 -- stopping.`);
    }

    // --- 5. tour-state correction: the two settlements these 7 loads sit on -------------------
    const TOUR_SETTLEMENT_IDS = ["68bfd169-291d-4b20-8199-f79cfea55e07", "f2ec92f4-afc2-4152-a744-a43adf1b57ee"]; // S-2026-0019, S-2026-0025
    const settlements = await client.query(
      `SELECT id, display_id, status, trip_closed_at, period_end::text AS period_end
         FROM driver_finance.driver_settlements
        WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
      [TOUR_SETTLEMENT_IDS, USMCA]
    );
    if (settlements.rows.length !== 2) throw new Error(`expected 2 tour settlements, found ${settlements.rows.length}`);
    for (const s of settlements.rows) {
      console.log(`FOUND settlement ${s.display_id}: status=${s.status} trip_closed_at=${s.trip_closed_at} period_end=${s.period_end}`);
    }
    const stillCancelled = settlements.rows.filter((s) => s.status === "cancelled").map((s) => s.id);
    if (stillCancelled.length) {
      await client.query(
        `UPDATE driver_finance.driver_settlements
            SET status = 'closed', trip_closed_at = COALESCE(trip_closed_at, period_end::timestamptz), updated_at = now()
          WHERE id = ANY($1::uuid[]) AND status = 'cancelled'`,
        [stillCancelled]
      );
      console.log(`tour state moved forward cancelled -> closed on: ${stillCancelled.join(", ")}`);
    } else {
      console.log("both tour settlements already closed -- nothing to do.");
    }

    if (!COMMIT) {
      console.log("DRY RUN -- rolling back. Pass --commit to apply.");
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");
    console.log("COMMITTED.");

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const verify = await client.query(
      `SELECT l.load_number, l.is_sample_data, l.rate_total_cents
         FROM mdata.loads l WHERE l.load_number = ANY($1::text[]) AND l.operating_company_id = $2::uuid
        ORDER BY l.load_number`,
      [LOAD_NUMBERS, USMCA]
    );
    const verifyBills = await client.query(
      `SELECT l.load_number, db.gross_amount_cents
         FROM driver_finance.driver_bills db JOIN mdata.loads l ON l.id = db.load_id
        WHERE l.load_number IN ('13509', '13579') AND l.operating_company_id = $1::uuid
        ORDER BY l.load_number`,
      [USMCA]
    );
    const verifyTours = await client.query(
      `SELECT display_id, status, trip_closed_at FROM driver_finance.driver_settlements
        WHERE id = ANY($1::uuid[]) ORDER BY display_id`,
      [TOUR_SETTLEMENT_IDS]
    );
    await client.query("COMMIT");
    console.log("VERIFY loads:", JSON.stringify(verify.rows));
    console.log("VERIFY driver bills:", JSON.stringify(verifyBills.rows));
    console.log("VERIFY tour settlements:", JSON.stringify(verifyTours.rows));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
