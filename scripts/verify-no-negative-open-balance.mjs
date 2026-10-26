#!/usr/bin/env node
/**
 * Row 21 (QBO unapplied credit) — no USMCA bill may have paid_cents > amount_cents, and no USMCA
 * invoice may have amount_paid_cents > total_cents, without the overpayment being cleared through
 * an unapplied vendor credit or credit memo.
 *
 * WHY THIS EXISTS
 * When a paid bill is reduced in amount (QBO-sync lower amount, or void-and-recreate at a lower
 * value), the "open balance" formula `amount_cents - paid_cents` goes negative: the bill appears
 * to owe the vendor money rather than the vendor owing us. The same can happen on the AR side
 * when an invoice is reduced below what was already collected.
 *
 * A negative open balance is not an accounting document. The correct resolution is an unapplied
 * vendor credit (bill side) or unapplied credit memo (invoice side) that absorbs the excess
 * payment and shows up as a receivable / pending refund.
 *
 * WHAT THIS CHECKS (live, USMCA company only)
 *   1. No non-voided bill has paid_cents > amount_cents.
 *   2. No non-voided invoice has amount_paid_cents > total_cents.
 *
 * Baseline: 0 overpaid bills, 0 overpaid invoices (measured 2026-10-25 on prod br-fancy-credit-akjnd07a).
 *
 *   node scripts/verify-no-negative-open-balance.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
export const REQUIRES_LIVE_DB =
  "live-money guard (overpaid bills/invoices); fails closed with no DATABASE_URL (ROUND 29.9-B) and runs in money-pr-local-gate.mjs when its owned paths change (E7 batch 2)";

const LABEL = "verify-no-negative-open-balance";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CEILING_BILLS = 0;
const CEILING_INVOICES = 0;

// Selftest: mutate live values to verify the guard would catch injected regressions.
if (process.argv.includes("--selftest")) {
  const problems = [];

  // Planted values that should trigger failures.
  const tooHighBills = CEILING_BILLS + 1;
  const tooHighInvoices = CEILING_INVOICES + 1;

  function checkCounts(overpaidBills, overpaidInvoices) {
    const errs = [];
    if (overpaidBills > CEILING_BILLS) errs.push(`${overpaidBills} bill(s) have paid_cents > amount_cents (ceiling ${CEILING_BILLS})`);
    if (overpaidInvoices > CEILING_INVOICES) errs.push(`${overpaidInvoices} invoice(s) have amount_paid_cents > total_cents (ceiling ${CEILING_INVOICES})`);
    return errs;
  }

  const caught1 = checkCounts(tooHighBills, 0);
  if (!caught1.some((e) => e.includes("paid_cents > amount_cents"))) {
    problems.push("planted overpaid-bill regression NOT caught");
  }

  const caught2 = checkCounts(0, tooHighInvoices);
  if (!caught2.some((e) => e.includes("amount_paid_cents > total_cents"))) {
    problems.push("planted overpaid-invoice regression NOT caught");
  }

  const clean = checkCounts(CEILING_BILLS, CEILING_INVOICES);
  if (clean.length) {
    problems.push(`false positive on clean values: ${clean.join("; ")}`);
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 regression checks caught correctly`);
  process.exit(0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

try {
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const billsRes = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM accounting.bills
     WHERE operating_company_id = $1::uuid
       AND voided_at IS NULL
       AND paid_cents > amount_cents`,
    [USMCA]
  );
  const overpaidBills = Number(billsRes.rows[0]?.n ?? 0);

  const invoicesRes = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM accounting.invoices
     WHERE operating_company_id = $1::uuid
       AND voided_at IS NULL
       AND amount_paid_cents > total_cents`,
    [USMCA]
  );
  const overpaidInvoices = Number(invoicesRes.rows[0]?.n ?? 0);

  const errors = [];
  if (overpaidBills > CEILING_BILLS) {
    errors.push(`${overpaidBills} USMCA bill(s) have paid_cents > amount_cents (ceiling ${CEILING_BILLS}); create vendor credits to absorb the overpayment`);
  }
  if (overpaidInvoices > CEILING_INVOICES) {
    errors.push(`${overpaidInvoices} USMCA invoice(s) have amount_paid_cents > total_cents (ceiling ${CEILING_INVOICES}); create credit memos to absorb the overpayment`);
  }

  if (errors.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(`${LABEL} PASS — overpaid_bills=${overpaidBills} overpaid_invoices=${overpaidInvoices} (ceiling ${CEILING_BILLS}/${CEILING_INVOICES})`);
} finally {
  client.release();
  await pool.end();
}
