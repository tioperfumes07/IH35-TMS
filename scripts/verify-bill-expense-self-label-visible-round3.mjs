#!/usr/bin/env node
/**
 * verify-bill-expense-self-label-visible-round3.mjs (ACCT-F6284/F6301-class, round 3)
 *
 * Root cause: third round of the same self-referential-row-label bug (verify-step 4620/4624) —
 * `entityLabel(row.<own-field>, row.id, ...)` on a row already fetched and rendering with real
 * data. Live-confirmed reproducible on two fields:
 *
 *   - `accounting.expenses.expense_number` NULL on 27,214/27,223 rows; `memo` empty on
 *     10,583/27,223 (Neon prod, bypass_rls). `EarningsTab.tsx`'s driver expense list used
 *     `entityLabel(row.memo, row.id, "Expense")` with no further fallback.
 *   - `accounting.bills.bill_number` NULL on 550/16,301 rows (established at verify-step 4624).
 *     Two more call sites found: `PayBillModal.tsx` (the "Bill #" header field AND the embedded
 *     apply-table column) and `WorkOrderDetailPage.tsx`'s linked-bills table column.
 *
 * Fix: swap each to `visibleDocumentLabel()` with a real-field fallback chain before the bare
 * noun — same established pattern as verify-step 4620/4624.
 *
 * Usage:
 *   node scripts/verify-bill-expense-self-label-visible-round3.mjs            # scan
 *   node scripts/verify-bill-expense-self-label-visible-round3.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const EARNINGS_FILE = "apps/frontend/src/components/drivers/EarningsTab.tsx";
const PAYBILL_FILE = "apps/frontend/src/pages/accounting/PayBillModal.tsx";
const WORKORDER_FILE = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";

function importsHelper(src) {
  return /import\s*\{[^}]*\bvisibleDocumentLabel\b[^}]*\}\s*from\s*["'][.\w/]*\/lib\/entity-label["']/.test(src);
}

function checkEarnings(src) {
  const offenders = [];
  if (!importsHelper(src)) {
    offenders.push(`${EARNINGS_FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — regression.`);
  }
  if (/kind="expense"[\s\S]{0,120}?entityLabel\(row\.memo, row\.id, "Expense"\)/.test(src)) {
    offenders.push(`${EARNINGS_FILE}: the driver expense row's own label still calls entityLabel(row.memo, ...) with no further fallback — a null/empty memo will render "Expense — not visible" on a genuinely visible row again.`);
  }
  if (!/visibleDocumentLabel\(\s*\n?\s*row\.expense_number\s*\?\?\s*row\.memo\s*\?\?\s*row\.line_description\s*\?\?\s*row\.vendor_name,/.test(src)) {
    offenders.push(`${EARNINGS_FILE}: the driver expense row's own label is not wired to visibleDocumentLabel() with the expense_number -> memo -> line_description -> vendor_name fallback chain.`);
  }
  return offenders;
}

function checkPayBill(src) {
  const offenders = [];
  if (!importsHelper(src)) {
    offenders.push(`${PAYBILL_FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — regression.`);
  }
  const badCalls = [
    /entityLabel\(bill\.bill_number, bill\.id, "Bill"\)/,
    /entityLabel\(row\.bill_number, row\.id, "Bill"\)/,
  ];
  for (const re of badCalls) {
    if (re.test(src)) {
      offenders.push(`${PAYBILL_FILE}: a bill row's own label still calls entityLabel(<>.bill_number, ...) — a null bill_number will render "Bill — not visible" on a genuinely visible row again.`);
    }
  }
  const goodCount = (src.match(/visibleDocumentLabel\([a-z]+\.bill_number\s*\?\?\s*[a-z]+\.memo\s*\?\?\s*[a-z]+\.vendor_name,/g) || []).length;
  if (goodCount < 2) {
    offenders.push(`${PAYBILL_FILE}: expected 2 bill self-labels wired to visibleDocumentLabel() with the bill_number -> memo -> vendor_name fallback chain, found ${goodCount}.`);
  }
  return offenders;
}

function checkWorkOrder(src) {
  const offenders = [];
  if (!importsHelper(src)) {
    offenders.push(`${WORKORDER_FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — regression.`);
  }
  if (/entityLabel\(row\.bill_number, row\.id, "Record"\)/.test(src)) {
    offenders.push(`${WORKORDER_FILE}: the linked-bill row's own label still calls entityLabel(row.bill_number, ...) — a null bill_number will render "Record — not visible" on a genuinely visible row again.`);
  }
  if (!/visibleDocumentLabel\(row\.bill_number\s*\?\?\s*row\.memo,\s*row\.id,\s*"Record"\)/.test(src)) {
    offenders.push(`${WORKORDER_FILE}: the linked-bill row's own label is not wired to visibleDocumentLabel() with the bill_number -> memo fallback chain.`);
  }
  return offenders;
}

export function checkAll(earningsSrc, payBillSrc, workOrderSrc) {
  return [...checkEarnings(earningsSrc), ...checkPayBill(payBillSrc), ...checkWorkOrder(workOrderSrc)];
}

export function run() {
  const earningsSrc = fs.readFileSync(path.join(repoRoot, EARNINGS_FILE), "utf8");
  const payBillSrc = fs.readFileSync(path.join(repoRoot, PAYBILL_FILE), "utf8");
  const workOrderSrc = fs.readFileSync(path.join(repoRoot, WORKORDER_FILE), "utf8");
  const offenders = checkAll(earningsSrc, payBillSrc, workOrderSrc);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyEarnings = `
    import { entityLabel } from "../../lib/entity-label";
    <EntityLink kind="expense" id={row.id} label={entityLabel(row.memo, row.id, "Expense")} />
  `;
  const buggyPayBill = `
    import { entityLabel } from "../../lib/entity-label";
    <EntityLink kind="bill" id={bill.id} label={entityLabel(bill.bill_number, bill.id, "Bill")} />
    <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Bill")} />
  `;
  const buggyWorkOrder = `
    import { entityLabel } from "../../lib/entity-label";
    <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Record")} />
  `;
  const fixedEarnings = fs.readFileSync(path.join(repoRoot, EARNINGS_FILE), "utf8");
  const fixedPayBill = fs.readFileSync(path.join(repoRoot, PAYBILL_FILE), "utf8");
  const fixedWorkOrder = fs.readFileSync(path.join(repoRoot, WORKORDER_FILE), "utf8");

  const buggyOffenders = checkAll(buggyEarnings, buggyPayBill, buggyWorkOrder);
  const fixedOffenders = checkAll(fixedEarnings, fixedPayBill, fixedWorkOrder);

  if (buggyOffenders.length >= 4 && fixedOffenders.length === 0) {
    console.log("verify-bill-expense-self-label-visible-round3 selftest OK");
    process.exit(0);
  }
  console.error("verify-bill-expense-self-label-visible-round3 selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-bill-expense-self-label-visible-round3 FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-bill-expense-self-label-visible-round3 OK — EarningsTab/PayBillModal/WorkOrderDetailPage all use visibleDocumentLabel() with a real-field fallback chain on their bill/expense row's own label",
  );
}
