#!/usr/bin/env node
/**
 * DISP-CASHFLOW-LINK — Read-only CI guard.
 *
 * Verifies that the four dispatch money events are wired through posting paths
 * that the cash-flow statement's direct-method classifier maps to the Operating section:
 *
 *   factoring_advance   → postFactoringAdvanceEvent → SECURED-BORROWING funding JE:
 *                         DR cash + reserve + fee / CR Factoring Advance liability (financing/operating legs).
 *                         A/R is UNTOUCHED at funding; it clears only when the customer pays FARO.
 *   factoring_fee       → booked at FUNDING as a Factoring Fees (Interest & Financing) expense line via
 *                         createJournalEntry (Expense → operating). NOT netted against A/R.
 *   settlement_payout   → postSettlement → createBill + payBill → bill_payment → DR AP / CR cash (Liability:AccountsPayable → operating)
 *   detention_revenue   → invoice line_type=detention → invoice posting → customer_payment → DR AR / CR Income (Income → operating)
 *
 * CODER-34: the factoring sections assert the SECURED-BORROWING model (ASC 860 / CPA ruling) — the sale-model
 * customer_payment assertions were removed here to stay consistent with scripts/verify-factoring-treatment.mjs
 * (the two guards must agree, never contradict). NO posting math is modified. Read/verify only.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`required file missing: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const failures = [];

// ── 1. Cash-flow service classifies Income / Expense / AR / AP as Operating ──
try {
  const svc = read("apps/backend/src/accounting/cash-flow.service.ts");
  const checks = [
    ['type === "Income"',                'cash-flow.service must bucket Income as operating'],
    ['type === "Expense"',               'cash-flow.service must bucket Expense as operating'],
    ["OPERATING_ASSET_SUBTYPES",         'cash-flow.service must have OPERATING_ASSET_SUBTYPES (AR, Inventory…)'],
    ["OPERATING_LIABILITY_SUBTYPES",     'cash-flow.service must have OPERATING_LIABILITY_SUBTYPES (AP…)'],
    ['return { bucket: "operating"',     'cash-flow.service must return operating bucket'],
  ];
  for (const [needle, msg] of checks) {
    if (!svc.includes(needle)) failures.push(msg);
  }
} catch (e) { failures.push(e.message); }

// ── 2. Factoring advance posts a SECURED-BORROWING funding JE (NOT the sale-model customer_payment) ──
// Mirrors scripts/verify-factoring-treatment.mjs so the two guards agree: the funding path must NOT emit a
// customer_payment / route through postSourceTransaction, and MUST credit the factoring_advance_liability.
try {
  const poster = read("apps/backend/src/accounting/factoring-posting/poster.service.ts");
  if (!/export async function postFactoringAdvanceEvent/.test(poster))
    failures.push("factoring-posting/poster.service must export postFactoringAdvanceEvent");
  if (/["']customer_payment["']/.test(poster) || /postSourceTransaction\(/.test(poster))
    failures.push("factoring advance must NOT post via customer_payment/postSourceTransaction (sale model) — it is a secured borrowing (Cr factoring_advance_liability)");
  if (!/factoring_advance_liability/.test(poster))
    failures.push("factoring advance must record a factoring_advance_liability credit (the borrowing) — not reduce A/R");
  if (!/createJournalEntry\(/.test(poster))
    failures.push("factoring advance must post a balanced JE via createJournalEntry");
} catch (e) { failures.push(e.message); }

// ── 3. Factoring fee is an Interest & Financing expense line booked AT FUNDING (not netted against A/R) ──
// The fee moved into the funding entry (Dr Factoring Fees / Cr Factoring Advance liability) in the poster;
// the old release-time fee poster is a documented no-op. Assert the funding poster resolves factor_fee_expense
// and posts it as an expense debit line.
try {
  const poster = read("apps/backend/src/accounting/factoring-posting/poster.service.ts");
  if (!/factor_fee_expense/.test(poster))
    failures.push("factoring fee must resolve the factor_fee_expense role (Interest & Financing) at funding — never netted against revenue/A/R");
  if (!/factoring fee/i.test(poster))
    failures.push("factoring fee must be posted as a distinct Factoring Fees expense line in the funding JE");
} catch (e) { failures.push(e.message); }

// ── 4. Settlement payout posts via Bill + BillPayment (bill_payment hits AP → operating) ──
try {
  const settle = read("apps/backend/src/payroll/driver-settlement.service.ts");
  if (!/export async function postSettlement/.test(settle))
    failures.push("driver-settlement.service must export postSettlement");
  if (!settle.includes("createBill"))
    failures.push("settlement payout must create an accounting Bill");
  if (!settle.includes("payBill"))
    failures.push("settlement payout must create an accounting BillPayment via payBill");
} catch (e) { failures.push(e.message); }

// ── 5. Detention revenue carried on Invoice as a line_type (routes to Income → operating) ──
try {
  const ilr = read("apps/backend/src/accounting/invoice-lines.routes.ts");
  if (!ilr.includes('"detention"'))
    failures.push("invoice-lines.routes must enumerate 'detention' as a valid line_type");
} catch (e) { failures.push(e.message); }

// ── 6. Posting engine handles both customer_payment and bill_payment cash legs ──
try {
  const eng = read("apps/backend/src/accounting/posting-engine.service.ts");
  if (!/buildBillPaymentLines/.test(eng))
    failures.push("posting-engine must contain buildBillPaymentLines (bill_payment → AP/cash)");
  if (!/buildCustomerPaymentLines/.test(eng))
    failures.push("posting-engine must contain buildCustomerPaymentLines (customer_payment → AR/cash)");
} catch (e) { failures.push(e.message); }

// ── 7. Cash-forecast uses factoring_advances for prediction expenses ──
try {
  const fc = read("apps/backend/src/accounting/cash-forecast.routes.ts");
  if (!fc.includes("accounting.factoring_advances"))
    failures.push("cash-forecast must read accounting.factoring_advances for weekly inflow/fee prediction");
  if (!fc.includes("factor_fee_cents"))
    failures.push("cash-forecast must include factor_fee_cents in prediction expenses");
} catch (e) { failures.push(e.message); }

if (failures.length > 0) {
  console.error("verify:cashflow-includes-dispatch-events — FAILED");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:cashflow-includes-dispatch-events — OK");
console.log("  factoring_advance  → secured-borrowing funding JE (Cr factoring_advance_liability; A/R untouched) ✓");
console.log("  factoring_fee      → Factoring Fees (Interest & Financing) expense line at funding → Expense → operating ✓");
console.log("  settlement_payout  → Bill + BillPayment → Liability:AccountsPayable → operating ✓");
console.log("  detention_revenue  → Invoice line_type=detention → Income → operating ✓");
