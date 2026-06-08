#!/usr/bin/env node
/**
 * DISP-CASHFLOW-LINK — Read-only CI guard.
 *
 * Verifies that the four dispatch money events are wired through posting paths
 * that the cash-flow statement's direct-method classifier maps to the Operating section:
 *
 *   factoring_advance   → postFactoringAdvanceEvent → customer_payment → DR cash / CR AR (Asset:AccountsReceivable → operating)
 *   factoring_fee       → postFactoringFeeExpenseEvent → JE DR Expense / CR AR (Expense → operating)
 *   settlement_payout   → postSettlement → createBill + payBill → bill_payment → DR AP / CR cash (Liability:AccountsPayable → operating)
 *   detention_revenue   → invoice line_type=detention → invoice posting → customer_payment → DR AR / CR Income (Income → operating)
 *
 * NO posting math is modified. Read/verify only.
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

// ── 2. Factoring advance posts via customer_payment backbone ──
try {
  const poster = read("apps/backend/src/accounting/factoring-posting/poster.service.ts");
  if (!/export async function postFactoringAdvanceEvent/.test(poster))
    failures.push("factoring-posting/poster.service must export postFactoringAdvanceEvent");
  if (!/source_transaction_type:\s*"customer_payment"/.test(poster) || !/postSourceTransaction\(/.test(poster))
    failures.push("factoring advance must post through customer_payment source via postSourceTransaction");
} catch (e) { failures.push(e.message); }

// ── 3. Factoring fee posts as an Expense journal entry (separate line, not netted) ──
try {
  const fees = read("apps/backend/src/accounting/factoring-fees-posting/poster.service.ts");
  if (!/export async function postFactoringFeeExpenseEvent/.test(fees))
    failures.push("factoring-fees-posting/poster.service must export postFactoringFeeExpenseEvent");
  if (!/resolveAccountForCategory\([^)]*"factoring_fee"/.test(fees))
    failures.push("factoring fee poster must resolve factoring_fee expense category (VQ6 — never netted against revenue)");
  if (!/createJournalEntry\(/.test(fees))
    failures.push("factoring fee poster must create a journal entry (DR expense)");
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
console.log("  factoring_advance  → customer_payment posting → Asset:AccountsReceivable → operating ✓");
console.log("  factoring_fee      → JE Expense line (VQ6 separate) → Expense → operating ✓");
console.log("  settlement_payout  → Bill + BillPayment → Liability:AccountsPayable → operating ✓");
console.log("  detention_revenue  → Invoice line_type=detention → Income → operating ✓");
