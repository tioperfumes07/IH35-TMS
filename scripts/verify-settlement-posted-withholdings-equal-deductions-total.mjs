#!/usr/bin/env node
/**
 * ENG-01b (443.322) step 18781 — live guard
 *
 * For every non-reversed USMCA settlement that has a deduction_journal_entry_id
 * (i.e. the application JE was created), verify that the sum of CREDIT postings in
 * that JE equals glr.deductions_cents.
 *
 * A mismatch means some applications were planned but never posted — the AP chain
 * silently dropped at least one deduction/escrow/advance application.
 *
 * Baseline: 0 failures (verified 2026-10-24 on prod br-fancy-credit-akjnd07a).
 *
 * Usage: node scripts/verify-settlement-posted-withholdings-equal-deductions-total.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-posted-withholdings-equal-deductions-total";
export const REQUIRES_LIVE_DB =
  "driver_finance.driver_settlement_gl_runs + accounting.journal_entry_postings — fails closed with no DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

/* ── self-test ─────────────────────────────────────────────────────────────── */

export function checkMismatch(expectedCents, actualCreditCents) {
  return expectedCents !== actualCreditCents ? { expectedCents, actualCreditCents } : null;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["balanced JE (2500=2500) → no finding", checkMismatch(2500, 2500) === null],
    ["dropped deduction detected (3500≠2500) → finding", checkMismatch(3500, 2500) !== null],
    ["dropped deduction finding has correct fields", (() => {
      const r = checkMismatch(3500, 2500);
      return r?.expectedCents === 3500 && r?.actualCreditCents === 2500;
    })()],
    ["multi-deduction balanced (6000=6000) → no finding", checkMismatch(6000, 6000) === null],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

/* ── live run ──────────────────────────────────────────────────────────────── */

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const totalRes = await client.query(
    `SELECT COUNT(*) AS n
       FROM driver_finance.driver_settlement_gl_runs
      WHERE operating_company_id = $1::uuid
        AND reversed_at IS NULL
        AND deduction_journal_entry_id IS NOT NULL
        AND deductions_cents > 0`,
    [USMCA]
  );
  const total = Number(totalRes.rows[0].n);
  if (total === 0) {
    console.error(
      `${LABEL}: LIVE SKIP — 0 posted settlements with deduction JE; completeness discriminator says no data yet`
    );
    // Allow pass when no settlements posted yet (not an instrument problem — entity is new)
    await client.query("COMMIT");
    process.exit(0);
  }

  const gapRes = await client.query(
    `SELECT
       ds.display_id,
       glr.deductions_cents                                                        AS expected_cents,
       COALESCE(SUM(jep.amount_cents) FILTER (
         WHERE jep.debit_or_credit = 'credit'
           AND jep.reversal_of_line_id  IS NULL
           AND jep.reversed_by_line_id  IS NULL
       ), 0)                                                                       AS actual_credit_cents
     FROM driver_finance.driver_settlement_gl_runs glr
     JOIN driver_finance.driver_settlements ds
       ON ds.id = glr.settlement_id
     JOIN accounting.journal_entry_postings jep
       ON jep.journal_entry_uuid = glr.deduction_journal_entry_id
     WHERE glr.operating_company_id = $1::uuid
       AND glr.reversed_at IS NULL
       AND glr.deduction_journal_entry_id IS NOT NULL
       AND glr.deductions_cents > 0
     GROUP BY ds.display_id, glr.deductions_cents
     HAVING COALESCE(SUM(jep.amount_cents) FILTER (
       WHERE jep.debit_or_credit = 'credit'
         AND jep.reversal_of_line_id  IS NULL
         AND jep.reversed_by_line_id  IS NULL
     ), 0) != glr.deductions_cents
     ORDER BY ds.display_id`,
    [USMCA]
  );

  await client.query("COMMIT");

  const violations = gapRes.rows;
  if (violations.length > 0) {
    console.error(
      `${LABEL}: LIVE FAIL — ${violations.length} settlement(s) have deduction JE credits ≠ glr.deductions_cents`
    );
    for (const r of violations) {
      const delta = Number(r.expected_cents) - Number(r.actual_credit_cents);
      console.error(
        `  ✗ ${r.display_id} — expected ${r.expected_cents}c, JE credits ${r.actual_credit_cents}c (${delta}c missing)`
      );
    }
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — 0 failures (${total} settled deduction JE(s) checked)`
  );
} finally {
  client.release();
  await pool.end();
}
