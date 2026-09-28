/**
 * ROUND 148/154 — A/P ADOPTION, SET-BASED. ONE TRANSACTION. INSERT...SELECT ONLY.
 *
 * Supersedes the per-bill-loop approach (settlement-bill-payment-adopt.service.ts +
 * 2026-09-28-cc1-round154-ap-adoption-held.ts) per Lead ruling "KILL THE LOOP" (2026-09-28):
 * ~1 bill / 2-3 min via createBill/payBill is 4+ hours for 120 bills. The owner struck the
 * "no direct insert into an accounting table" rule the same night (#22902, merged 027dd1780a) —
 * direct set-based INSERT into accounting tables is authorized for exactly this reason.
 *
 * Adopts every active driver_finance.driver_bills row belonging to one of the 47
 * payrun-closed settlements (driver_finance.payrun_gl_runs, status='posted',
 * journal_entry_id IS NOT NULL) as a real accounting.bills/bill_lines/bill_payments document,
 * linked to driver_finance.driver_settlement_gl_runs/driver_settlement_gl_bills, with GL
 * posting explicitly HELD (posting_hold_reason). POSTS NO NEW JOURNAL LINES — the real money
 * already posted under the payrun JE; this only creates the historical document trail. Never
 * calls createBill/payBill (that is what was fighting the per-bill approach) and never touches
 * accounting.journal_entry_postings.
 *
 * Idempotent: a driver_bill already adopted has a driver_finance.driver_settlement_gl_bills row
 * with accounting_bill_id IS NOT NULL (the order's own SQL sketch assumed a
 * accounting.bills.source_driver_bill_id column; live-verified 2026-09-28 that column does not
 * exist — this is the correct existing linkage table instead, purpose-built for this).
 *
 * Deduction allocation replicates settlement-bill-payment.math.ts's allocateDeductionsAcrossBills
 * exactly (same greedy walk, same driver_bills ORDER BY created_at ASC, id ASC as
 * loadDriverBills), via a window-function running-sum instead of a JS loop — same math,
 * set-based.
 *
 * Excludes (STOP AND REPORT, not forced): any driver_bill whose driver has no vendor link
 * (mdata.vendors.driver_id) — live-verified 2026-09-28: exactly one remaining driver, ANGEL
 * ALFONSO SOSA PEREZ (post-merge survivor 52037e93), 8 bills.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // owner
const LABEL = "ap-adoption-setbased";

const DRY = process.env.DRY_RUN === "1";
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;

if (!DRY && !REQUIRED_AUTH_ID) {
  console.error(`${LABEL}: OWNER_AUTH_ID env var is required for --apply (DRY_RUN=1 for dry run)`);
  process.exit(1);
}
if (!DRY) {
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID!], { stdio: "inherit" });
  } catch {
    console.error(`${LABEL}: AUTH ${REQUIRED_AUTH_ID} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md`);
    process.exit(1);
  }
}

const tbSql = `
  SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE 0 END),0)::bigint AS dr,
         COALESCE(SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END),0)::bigint AS cr,
         count(*)::int AS rows
  FROM accounting.journal_entry_postings WHERE operating_company_id = $1`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [ACTOR_USER_ID]);

    console.log(`${LABEL}: ${DRY ? "DRY RUN" : "APPLY"}`);

    const tb0 = (await client.query(tbSql, [USMCA])).rows[0];
    const bills0 = Number((await client.query(`SELECT count(*)::int n FROM accounting.bills WHERE operating_company_id=$1 AND voided_at IS NULL`, [USMCA])).rows[0].n);
    const payments0 = Number((await client.query(`SELECT count(*)::int n FROM accounting.bill_payments WHERE operating_company_id=$1 AND voided_at IS NULL`, [USMCA])).rows[0].n);
    const glRuns0 = Number((await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlement_gl_runs WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
    const glBills0 = Number((await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlement_gl_bills`)).rows[0].n);
    console.log(`  BEFORE: bills=${bills0} payments=${payments0} gl_runs=${glRuns0} gl_bills=${glBills0} TB dr=${tb0.dr} cr=${tb0.cr} rows=${tb0.rows}`);

    // ── 47 target settlements ────────────────────────────────────────────────────────────────
    const settlementCount = Number(
      (
        await client.query(
          `SELECT count(DISTINCT settlement_id)::int n FROM driver_finance.payrun_gl_runs
           WHERE operating_company_id=$1 AND status='posted' AND journal_entry_id IS NOT NULL`,
          [USMCA],
        )
      ).rows[0].n,
    );
    if (settlementCount !== 47) {
      throw new Error(`expected 47 payrun-closed settlements, found ${settlementCount} — re-measure, do not force`);
    }
    console.log(`  target settlements: ${settlementCount}`);

    // ── Step 1: ensure every target settlement has a driver_settlement_gl_runs row ───────────
    const runsCreated = await client.query(
      `INSERT INTO driver_finance.driver_settlement_gl_runs
         (operating_company_id, settlement_id, driver_id, driver_vendor_id, run_key, gross_cents, deductions_cents, net_cents, status, posted_by_user_id)
       SELECT pgr.operating_company_id, pgr.settlement_id, ds.driver_id, v.id,
              'ih35:ap-adoption-setbased:v1:' || lower(pgr.operating_company_id::text) || ':' || lower(pgr.settlement_id::text),
              COALESCE(ds.gross_pay,0)::bigint, COALESCE(ds.deductions_total,0)::bigint, COALESCE(ds.net_pay,0)::bigint,
              'posted', $2::uuid
       FROM (SELECT DISTINCT settlement_id, operating_company_id FROM driver_finance.payrun_gl_runs
              WHERE operating_company_id=$1 AND status='posted' AND journal_entry_id IS NOT NULL) pgr
       JOIN driver_finance.driver_settlements ds ON ds.id = pgr.settlement_id
       JOIN mdata.vendors v ON v.driver_id = ds.driver_id AND v.operating_company_id = pgr.operating_company_id
       WHERE NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_runs r WHERE r.settlement_id = pgr.settlement_id)
       RETURNING id`,
      [USMCA, ACTOR_USER_ID],
    );
    console.log(`  driver_settlement_gl_runs created for previously-missing settlements: ${runsCreated.rowCount}`);

    // Some of the 47 target settlements belong to a driver with no vendor link (live-verified:
    // ANGEL ALFONSO SOSA PEREZ, 52037e93, 3 settlements) and cannot get a gl_run row —
    // driver_settlement_gl_runs.driver_vendor_id is NOT NULL. This is a real, reported gap, not
    // forced. The real invariant: every settlement WHOSE DRIVER HAS A VENDOR must have a gl_run.
    const missingRunsForVendoredDrivers = Number(
      (
        await client.query(
          `SELECT count(DISTINCT pgr.settlement_id)::int n FROM driver_finance.payrun_gl_runs pgr
           JOIN driver_finance.driver_settlements ds ON ds.id = pgr.settlement_id
           WHERE pgr.operating_company_id=$1 AND pgr.status='posted' AND pgr.journal_entry_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.driver_id = ds.driver_id AND v.operating_company_id = $1)
             AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_runs r WHERE r.settlement_id = pgr.settlement_id)`,
          [USMCA],
        )
      ).rows[0].n,
    );
    const glRunsNow = Number((await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlement_gl_runs WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
    console.log(`  driver_settlement_gl_runs now: ${glRunsNow}; settlements with a vendored driver still missing a run: ${missingRunsForVendoredDrivers}`);
    if (missingRunsForVendoredDrivers > 0) {
      throw new Error(`${missingRunsForVendoredDrivers} settlement(s) with a vendor-linked driver still have no gl_run after backfill — refusing`);
    }

    // ── Step 2: staging table — pre-generate bill_id, compute deduction allocation set-based ─
    await client.query("DROP TABLE IF EXISTS ap_adopt_staging");
    await client.query(`
      CREATE TEMP TABLE ap_adopt_staging AS
      WITH target_settlements AS (
        SELECT DISTINCT pgr.settlement_id, pgr.journal_entry_id, je.entry_date, ds.source_document_ref
        FROM driver_finance.payrun_gl_runs pgr
        JOIN accounting.journal_entries je ON je.id = pgr.journal_entry_id
        JOIN driver_finance.driver_settlements ds ON ds.id = pgr.settlement_id
        WHERE pgr.operating_company_id = $1 AND pgr.status='posted' AND pgr.journal_entry_id IS NOT NULL
      ),
      eligible_bills_raw AS (
        SELECT DISTINCT db.id AS driver_bill_id, db.operating_company_id, db.driver_id, db.load_id, db.load_number,
               db.gross_amount_cents::bigint AS gross_amount_cents, ts.settlement_id, ts.journal_entry_id,
               ts.entry_date, ts.source_document_ref, db.created_at
        FROM driver_finance.driver_bills db
        JOIN target_settlements ts ON (
          db.settled_in_settlement_id = ts.settlement_id
          OR db.id IN (
            SELECT sl.source_driver_bill_id FROM driver_finance.settlement_lines sl
            WHERE sl.settlement_id = ts.settlement_id AND sl.source_driver_bill_id IS NOT NULL AND sl.is_active = true
          )
        )
        WHERE db.operating_company_id = $1 AND db.status <> 'void'
          AND NOT EXISTS (
            SELECT 1 FROM driver_finance.driver_settlement_gl_bills gb
            WHERE gb.driver_bill_id = db.id AND gb.accounting_bill_id IS NOT NULL
          )
      ),
      -- Live-verified 2026-09-28: 3 (driver, load) pairs each carry TWO separate driver_bills
      -- rows for the same load/driver/settlement (a pre-existing data-quality defect in
      -- driver_finance.driver_bills, not caused by this adoption). accounting.bills has a real
      -- UNIQUE(operating_company_id, mdata_vendor_id, bill_number) constraint on TMS-native
      -- bills that a naive adopt would violate. STOP AND REPORT, not guessed: exclude BOTH sides
      -- of any such duplicate rather than pick one amount arbitrarily.
      duplicate_load_pairs AS (
        SELECT driver_id, load_number FROM eligible_bills_raw GROUP BY driver_id, load_number HAVING count(*) > 1
      ),
      eligible_bills AS (
        SELECT eb.* FROM eligible_bills_raw eb
        WHERE NOT EXISTS (
          SELECT 1 FROM duplicate_load_pairs dlp WHERE dlp.driver_id = eb.driver_id AND dlp.load_number = eb.load_number
        )
      ),
      driver_vendors AS (
        SELECT DISTINCT ON (driver_id) driver_id, id AS vendor_id, qbo_vendor_id
        FROM mdata.vendors WHERE operating_company_id = $1 AND driver_id IS NOT NULL
        ORDER BY driver_id, created_at DESC NULLS LAST
      ),
      to_adopt AS (
        SELECT eb.*, dv.vendor_id, dv.qbo_vendor_id
        FROM eligible_bills eb JOIN driver_vendors dv ON dv.driver_id = eb.driver_id
      ),
      settlement_deductions AS (
        SELECT applied_to_settlement_id AS settlement_id, SUM(amount_cents)::bigint AS total_deduction_cents
        FROM driver_finance.driver_settlement_deductions
        WHERE operating_company_id = $1 AND amount_cents > 0
        GROUP BY applied_to_settlement_id
      ),
      allocated AS (
        SELECT ta.*,
          COALESCE(sd.total_deduction_cents,0) AS settlement_total_deduction_cents,
          COALESCE(SUM(ta.gross_amount_cents) OVER (
            PARTITION BY ta.settlement_id ORDER BY ta.created_at, ta.driver_bill_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS prior_gross_sum
        FROM to_adopt ta
        LEFT JOIN settlement_deductions sd ON sd.settlement_id = ta.settlement_id
      )
      SELECT
        gen_random_uuid() AS bill_id,
        driver_bill_id, operating_company_id, driver_id, load_id, load_number, settlement_id,
        source_document_ref, journal_entry_id, entry_date, vendor_id, qbo_vendor_id,
        gross_amount_cents,
        LEAST(gross_amount_cents, GREATEST(0, settlement_total_deduction_cents - prior_gross_sum)) AS deduction_cents,
        gross_amount_cents - LEAST(gross_amount_cents, GREATEST(0, settlement_total_deduction_cents - prior_gross_sum)) AS cash_cents,
        (SELECT r.id FROM driver_finance.driver_settlement_gl_runs r WHERE r.settlement_id = allocated.settlement_id) AS gl_run_id
      FROM allocated`,
      [USMCA],
    );
    const stagedCount = Number((await client.query(`SELECT count(*)::int n FROM ap_adopt_staging`)).rows[0].n);
    console.log(`  staged for adoption: ${stagedCount}`);

    const excludedNoVendor = await client.query(
      `WITH target_settlements AS (
         SELECT DISTINCT pgr.settlement_id FROM driver_finance.payrun_gl_runs pgr
         WHERE pgr.operating_company_id=$1 AND pgr.status='posted' AND pgr.journal_entry_id IS NOT NULL
       ),
       eligible_bills AS (
         SELECT DISTINCT db.id, db.driver_id FROM driver_finance.driver_bills db
         JOIN target_settlements ts ON (
           db.settled_in_settlement_id = ts.settlement_id
           OR db.id IN (SELECT sl.source_driver_bill_id FROM driver_finance.settlement_lines sl
             WHERE sl.settlement_id=ts.settlement_id AND sl.source_driver_bill_id IS NOT NULL AND sl.is_active=true)
         )
         WHERE db.operating_company_id=$1 AND db.status <> 'void'
           AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills gb WHERE gb.driver_bill_id=db.id AND gb.accounting_bill_id IS NOT NULL)
       )
       SELECT d.first_name, d.last_name, e.driver_id::text, count(*)::int AS bill_count
       FROM eligible_bills e JOIN mdata.drivers d ON d.id = e.driver_id
       WHERE NOT EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.driver_id = e.driver_id AND v.operating_company_id=$1)
       GROUP BY d.first_name, d.last_name, e.driver_id`,
      [USMCA],
    );
    console.log(`  EXCLUDED (no vendor link — STOP AND REPORT, not forced):`);
    for (const r of excludedNoVendor.rows) {
      console.log(`    ${r.first_name} ${r.last_name} (${r.driver_id}): ${r.bill_count} bill(s)`);
    }

    const excludedDuplicateLoads = await client.query(
      `WITH target_settlements AS (
         SELECT DISTINCT pgr.settlement_id FROM driver_finance.payrun_gl_runs pgr
         WHERE pgr.operating_company_id=$1 AND pgr.status='posted' AND pgr.journal_entry_id IS NOT NULL
       ),
       eligible_bills_raw AS (
         SELECT DISTINCT db.id, db.driver_id, db.load_number, db.gross_amount_cents, db.status, db.settled_in_settlement_id
         FROM driver_finance.driver_bills db
         JOIN target_settlements ts ON (
           db.settled_in_settlement_id = ts.settlement_id
           OR db.id IN (SELECT sl.source_driver_bill_id FROM driver_finance.settlement_lines sl
             WHERE sl.settlement_id=ts.settlement_id AND sl.source_driver_bill_id IS NOT NULL AND sl.is_active=true)
         )
         WHERE db.operating_company_id=$1 AND db.status <> 'void'
           AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills gb WHERE gb.driver_bill_id=db.id AND gb.accounting_bill_id IS NOT NULL)
       )
       SELECT d.first_name, d.last_name, eb.driver_id::text, eb.load_number, eb.id::text AS driver_bill_id, eb.gross_amount_cents
       FROM eligible_bills_raw eb
       JOIN mdata.drivers d ON d.id = eb.driver_id
       WHERE (eb.driver_id, eb.load_number) IN (SELECT driver_id, load_number FROM eligible_bills_raw GROUP BY driver_id, load_number HAVING count(*) > 1)
       ORDER BY eb.driver_id, eb.load_number, eb.gross_amount_cents`,
      [USMCA],
    );
    console.log(`  EXCLUDED (duplicate driver_bills rows for the same load — STOP AND REPORT, not guessed):`);
    for (const r of excludedDuplicateLoads.rows) {
      console.log(`    ${r.first_name} ${r.last_name} load ${r.load_number}: driver_bill ${r.driver_bill_id} $${(r.gross_amount_cents / 100).toFixed(2)}`);
    }

    const DRIVER_PAY_ACCOUNT_ID = "fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b"; // same account every prior adopted bill used
    const DIP_BANK_ACCOUNT_ID = "e83028a5-dcda-4233-b660-5b9923b3d39c"; // same account every prior adopted cash payment used

    // ── Step 3: bills ─────────────────────────────────────────────────────────────────────────
    const billsInserted = await client.query(
      `INSERT INTO accounting.bills (
         id, operating_company_id, vendor_id, vendor_uuid, mdata_vendor_id, bill_number, bill_date,
         amount_cents, total_amount, status, memo, coa_account_id, driver_id, load_id, source_system,
         posting_hold_reason, created_by_user_id
       )
       SELECT
         s.bill_id, s.operating_company_id, COALESCE(s.qbo_vendor_id, s.vendor_id::text), s.vendor_id::text, s.vendor_id,
         s.load_number, s.entry_date::date, s.gross_amount_cents, (s.gross_amount_cents / 100.0),
         'paid',
         'Load ' || s.load_number || ' — Settlement ' || s.source_document_ref || ' (ADOPTED from payrun_gl_run, set-based) — driver pay',
         $1::uuid, s.driver_id, s.load_id, 'tms',
         'adopted_from_payrun_gl_run:setbased:je:' || s.journal_entry_id::text,
         $2::uuid
       FROM ap_adopt_staging s
       RETURNING id`,
      [DRIVER_PAY_ACCOUNT_ID, ACTOR_USER_ID],
    );
    console.log(`  accounting.bills inserted: ${billsInserted.rowCount}`);

    // ── Step 4: bill_lines (one per bill) ────────────────────────────────────────────────────
    const linesInserted = await client.query(
      `INSERT INTO accounting.bill_lines (
         id, bill_id, line_sequence, amount, description, section, load_id, operating_company_id,
         account_id, load_required
       )
       SELECT gen_random_uuid(), s.bill_id, 1, (s.gross_amount_cents / 100.0),
         'Load ' || s.load_number || ' — driver pay (ADOPTED)', 'A', s.load_id, s.operating_company_id,
         $1::uuid, true
       FROM ap_adopt_staging s
       RETURNING id`,
      [DRIVER_PAY_ACCOUNT_ID],
    );
    console.log(`  accounting.bill_lines inserted: ${linesInserted.rowCount}`);

    // ── Step 5: bill_payments — non-cash deduction leg (only where deduction_cents > 0) ──────
    const deductionPayments = await client.query(
      `INSERT INTO accounting.bill_payments (
         id, operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount,
         payment_method, memo, status, created_by_user_id, settlement_deduction_noncash
       )
       SELECT gen_random_uuid(), s.operating_company_id, s.bill_id, s.vendor_id::text, s.entry_date::date,
         s.deduction_cents, (s.deduction_cents / 100.0), 'other',
         'Settlement ' || s.source_document_ref || ' (ADOPTED, set-based) — deduction recovery (non-cash), load ' || s.load_number,
         'posted', $1::uuid, true
       FROM ap_adopt_staging s
       WHERE s.deduction_cents > 0
       RETURNING id`,
      [ACTOR_USER_ID],
    );
    console.log(`  accounting.bill_payments (deduction, non-cash) inserted: ${deductionPayments.rowCount}`);

    // ── Step 6: bill_payments — cash leg (only where cash_cents > 0) ─────────────────────────
    const cashPayments = await client.query(
      `INSERT INTO accounting.bill_payments (
         id, operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount,
         payment_method, from_bank_account_id, memo, status, created_by_user_id, settlement_deduction_noncash
       )
       SELECT gen_random_uuid(), s.operating_company_id, s.bill_id, s.vendor_id::text, s.entry_date::date,
         s.cash_cents, (s.cash_cents / 100.0), 'ach', $1::uuid,
         'Settlement ' || s.source_document_ref || ' (ADOPTED, set-based) — net driver pay (held), load ' || s.load_number,
         'posted', $2::uuid, false
       FROM ap_adopt_staging s
       WHERE s.cash_cents > 0
       RETURNING id`,
      [DIP_BANK_ACCOUNT_ID, ACTOR_USER_ID],
    );
    console.log(`  accounting.bill_payments (cash) inserted: ${cashPayments.rowCount}`);

    // ── Step 7: driver_finance.driver_settlement_gl_bills linkage ────────────────────────────
    const glBillsInserted = await client.query(
      `INSERT INTO driver_finance.driver_settlement_gl_bills (
         operating_company_id, run_id, settlement_id, driver_bill_id, load_id, load_number,
         accounting_bill_id, gross_cents, deduction_cents, cash_cents
       )
       SELECT s.operating_company_id, s.gl_run_id, s.settlement_id, s.driver_bill_id, s.load_id, s.load_number,
         s.bill_id, s.gross_amount_cents, s.deduction_cents, s.cash_cents
       FROM ap_adopt_staging s
       RETURNING id`,
    );
    console.log(`  driver_finance.driver_settlement_gl_bills inserted: ${glBillsInserted.rowCount}`);

    // ── Step 8: flip driver_bills.status to 'paid' (matching the already-adopted convention) ─
    const driverBillsFlipped = await client.query(
      `UPDATE driver_finance.driver_bills db SET status = 'paid', updated_at = now()
       WHERE db.id IN (SELECT driver_bill_id FROM ap_adopt_staging) AND db.status <> 'paid'
       RETURNING id`,
    );
    console.log(`  driver_finance.driver_bills flipped to paid: ${driverBillsFlipped.rowCount}`);

    // ── Verification ──────────────────────────────────────────────────────────────────────────
    const tb1 = (await client.query(tbSql, [USMCA])).rows[0];
    const bills1 = Number((await client.query(`SELECT count(*)::int n FROM accounting.bills WHERE operating_company_id=$1 AND voided_at IS NULL`, [USMCA])).rows[0].n);
    const payments1 = Number((await client.query(`SELECT count(*)::int n FROM accounting.bill_payments WHERE operating_company_id=$1 AND voided_at IS NULL`, [USMCA])).rows[0].n);
    const glRuns1 = Number((await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlement_gl_runs WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
    const glBills1 = Number((await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlement_gl_bills`)).rows[0].n);
    console.log(`  AFTER: bills=${bills1} payments=${payments1} gl_runs=${glRuns1} gl_bills=${glBills1} TB dr=${tb1.dr} cr=${tb1.cr} rows=${tb1.rows}`);

    if (tb1.dr !== tb0.dr || tb1.cr !== tb0.cr || tb1.rows !== tb0.rows) {
      throw new Error(`TRIAL BALANCE MOVED — before dr=${tb0.dr} cr=${tb0.cr} rows=${tb0.rows}, after dr=${tb1.dr} cr=${tb1.cr} rows=${tb1.rows}. This must be zero-JE-impact — aborting.`);
    }
    if (tb1.dr !== tb1.cr) {
      throw new Error(`TRIAL BALANCE UNBALANCED — dr=${tb1.dr} cr=${tb1.cr}`);
    }

    // Every staged bill must have exactly one gl_bills row with accounting_bill_id set.
    const unlinked = Number(
      (
        await client.query(
          `SELECT count(*)::int n FROM ap_adopt_staging s
           WHERE NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills gb WHERE gb.driver_bill_id = s.driver_bill_id AND gb.accounting_bill_id IS NOT NULL)`,
        )
      ).rows[0].n,
    );
    if (unlinked > 0) {
      throw new Error(`${unlinked} staged bill(s) have no gl_bills linkage after insert — refusing to commit`);
    }

    console.log("");
    console.log(`  RESULT: ${stagedCount} bills adopted, TB unchanged (dr=cr=${tb1.dr}, ${tb1.rows} rows), 0 unlinked.`);
    console.log(`  Excluded for no vendor: ${excludedNoVendor.rows.reduce((s, r) => s + r.bill_count, 0)} bill(s) across ${excludedNoVendor.rows.length} driver(s).`);

    if (DRY) {
      console.log("");
      console.log("  DRY RUN — rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("");
      console.log("  COMMITTED.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAILED, rolled back — ${(err as Error).message}`);
    console.error((err as Error).stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
