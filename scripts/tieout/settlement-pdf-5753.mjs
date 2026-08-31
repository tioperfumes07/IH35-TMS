#!/usr/bin/env node
/**
 * SETL-TIEOUT-01 — settlement 5772's USMCA-only portion vs the owner's source packet,
 * tolerance 0. Filename kept as settlement-pdf-5753.mjs (registered path in
 * scripts/next-urgent6.sh / docs/module-completion/settlements.json) even though the real
 * owner-directed specimen is settlement 5772 (docs/lockdown/Coders-Faro/CC-1/
 * CC-1-HUMAN-SEQUENCE-REPLAY.txt) — no doc named "5753" exists in this repo.
 *
 * Settlement 5772 is a MIXED settlement: 4 loads, 2 USMCA (13512, 13513) + 2 Transportation
 * (13502, 13507). Build/grade ONLY the USMCA portion — never the driver's full settlement.
 *
 * EXPECTED is sourced from the owner's own CSVs, not re-derived or guessed:
 *   CC-1-AUG-LOADS-BY-FACTOR.csv          driver_pay_usd + driver_deductions_usd per load
 *   CC-1-AUG-EXPENSES-DEDUCTIONS-BY-ENTITY.csv   line-item expenses/addl-pay/deductions
 *   CC-1-AUG-SETTLEMENTS-MIXED-BY-FACTOR.csv     usmca_pay=667.40 cross-check (matches
 *                                                 422.46 + 244.94 exactly)
 * Loads are matched by customer_wo_number (2239480 for 13512, 005772267 for 13513) — the
 * TMS-generated load_number ("L-YYYYMMDD-NNNN") is assigned at creation and cannot be
 * predicted ahead of the build, but the customer W.O. number is a stable value named in the
 * source packet and is unique per load.
 *
 * Two checks, tolerance 0:
 *   1. LINKAGE — every settlement_lines row for these two loads carries a non-null load_id
 *      AND posting_account_id, and reaches approval_status='approved'. Per the replay doc,
 *      this specific gate "has NEVER been achieved" system-wide as of 2026-08-30 — it is
 *      the real bar, not a formality.
 *   2. AMOUNT — the total absolute dollar magnitude of those lines equals $901.01 (driver
 *      pay 667.40 + addl pay 50.00 + reimbursed expenses 123.61 + deductions 60.00).
 *      Absolute value is used deliberately: the settlement_lines.amount sign convention for
 *      a deduction line has never been observed live (zero deduction-type rows exist
 *      system-wide as of this writing), so asserting a specific sign here would risk a false
 *      FAIL on a sign-convention difference that has nothing to do with the real number being
 *      right or wrong. The dollar magnitude is unambiguous and owner-sourced.
 */
import pg from "pg";
import { fail, requireDb, unverified } from "./_lib.mjs";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";

const { buildPgPoolConfig } = pgConnectionOptions;

const USMCA_OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_WO_NUMBERS = ["2239480", "005772267"]; // load 13512, load 13513

export const EXPECTED = {
  settlement_source_id: 5772,
  loads: ["13512", "13513"],
  driver_pay_cents: 42246 + 24494, // load 13512 422.46 + load 13513 244.94 = 667.40
  addl_pay_cents: 5000, // 50.00 (load 13512 only)
  reimbursed_expense_cents: 6722 + 4114 + 1525, // 123.61 (67.22 + 41.14 + 15.25)
  deduction_cents: 2500 + 3500, // 60.00 (load 13512 25.00 + load 13513 35.00)
  total_abs_cents: 42246 + 24494 + 5000 + 6722 + 4114 + 1525 + 2500 + 3500, // 901.01
  tolerance_cents: 0,
};

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

const url = requireDb();

async function main() {
  const pool = new pg.Pool(buildPgPoolConfig(url));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const jeControl = await client.query(
      "SELECT count(*)::int AS n FROM accounting.journal_entries"
    );
    if (!jeControl.rows[0] || jeControl.rows[0].n < 2219) {
      await client.query("ROLLBACK");
      unverified(
        `je_control discriminator too low (${jeControl.rows[0]?.n ?? "null"}, expected >= 2219) — session/bypass context not trusted`
      );
    }

    const loadsRes = await client.query(
      `SELECT id, load_number, customer_wo_number
       FROM mdata.loads
       WHERE operating_company_id = $1::uuid AND customer_wo_number = ANY($2::text[])`,
      [USMCA_OPCO, USMCA_WO_NUMBERS]
    );
    if (loadsRes.rows.length === 0) {
      await client.query("ROLLBACK");
      fail(
        "SETL-TIEOUT-01 FAIL: neither USMCA load exists yet (customer_wo_number 2239480 / 005772267) — settlement 5772's USMCA portion cannot be built until Dispatch creates loads 13512/13513 (empty is never PASS)"
      );
    }
    const loadIds = loadsRes.rows.map((r) => r.id);

    const linesRes = await client.query(
      `SELECT sl.id, sl.load_id, sl.posting_account_id, sl.approval_status, sl.amount, sl.line_type
       FROM driver_finance.settlement_lines sl
       WHERE sl.operating_company_id = $1::uuid AND sl.load_id = ANY($2::uuid[]) AND sl.is_active = true`,
      [USMCA_OPCO, loadIds]
    );
    if (linesRes.rows.length === 0) {
      await client.query("ROLLBACK");
      fail(
        `SETL-TIEOUT-01 FAIL: ${loadsRes.rows.length} of 2 USMCA loads exist (${loadsRes.rows
          .map((r) => `${r.customer_wo_number}=${r.load_number}`)
          .join(", ")}) but zero settlement_lines reference them yet — settlement 5772's USMCA portion not built (empty is never PASS)`
      );
    }

    await client.query("COMMIT");

    const unlinked = linesRes.rows.filter((r) => !r.load_id || !r.posting_account_id);
    const unapproved = linesRes.rows.filter((r) => r.approval_status !== "approved");
    const totalAbsCents = linesRes.rows.reduce(
      (sum, r) => sum + Math.round(Math.abs(Number(r.amount)) * 100),
      0
    );

    const observed = {
      loads_found: loadsRes.rows.length,
      lines_found: linesRes.rows.length,
      unlinked_count: unlinked.length,
      unapproved_count: unapproved.length,
      total_abs_cents: totalAbsCents,
    };
    console.log(`TIEOUT OBSERVED: ${JSON.stringify(observed)}`);

    const diffs = [];
    if (loadsRes.rows.length < 2) {
      diffs.push(`only ${loadsRes.rows.length} of 2 USMCA loads exist yet (13512, 13513)`);
    }
    if (unlinked.length > 0) {
      diffs.push(
        `${unlinked.length} line(s) missing load_id/posting_account_id: ${unlinked.map((r) => r.id).join(", ")}`
      );
    }
    if (unapproved.length > 0) {
      diffs.push(
        `${unapproved.length} line(s) not approval_status='approved': ${unapproved
          .map((r) => `${r.id}=${r.approval_status}`)
          .join(", ")}`
      );
    }
    if (totalAbsCents !== EXPECTED.total_abs_cents) {
      diffs.push(
        `total_abs_cents observed ${totalAbsCents} vs expected ${EXPECTED.total_abs_cents} (diff ${totalAbsCents - EXPECTED.total_abs_cents})`
      );
    }

    if (diffs.length) {
      fail(`SETL-TIEOUT-01 FAIL (${diffs.length} mismatch(es)):\n  ` + diffs.join("\n  "));
    }

    console.log("TIEOUT PASS: settlement 5772's USMCA portion (loads 13512+13513) ties to the owner packet at tolerance 0");
    process.exit(0);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure, the connection is being released regardless
    }
    fail(`SETL-TIEOUT-01 errored: ${e.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
