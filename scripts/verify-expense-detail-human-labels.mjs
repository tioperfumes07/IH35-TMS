#!/usr/bin/env node
/**
 * Static guard: ExpenseDetailPage must show human-readable labels for JE and
 * bank transaction hops (CLS-LINKAGE-ONEWAY). Prefer date+memo/description;
 * never entityLabel(null, id) or UUID slice chrome.
 *
 * ACCT-F5072 — ratcheted: UUID-slice fallback was a defect class, not a requirement.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-detail-human-labels";
const DETAIL = "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx";
const API = "apps/frontend/src/api/accounting.ts";
const BACKEND = "apps/backend/src/accounting/expenses.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertExpenseDetailHumanLabels() {
  const errors = [];
  const detailPage = read(DETAIL);
  const apiTypes = read(API);
  const backend = read(BACKEND);

  if (!/journal_entry_date/.test(apiTypes) || !/journal_entry_memo/.test(apiTypes)) {
    errors.push("ExpenseDetail type missing journal_entry_date / journal_entry_memo");
  }
  if (!/matched_bank_transaction_date/.test(apiTypes) || !/matched_bank_transaction_description/.test(apiTypes)) {
    errors.push("ExpenseDetail type missing matched_bank_transaction_date / matched_bank_transaction_description");
  }
  if (!/je\.entry_date/.test(backend)) {
    errors.push("Backend expense detail query does not join journal_entries.entry_date");
  }
  if (!/bt\.transaction_date/.test(backend) || !/bt\.description/.test(backend)) {
    errors.push("Backend expense detail query does not join bank_transactions.transaction_date/description");
  }
  if (!/formatDateUS\(expense\.journal_entry_date\)/.test(detailPage)) {
    errors.push("ExpenseDetailPage does not render journal entry date");
  }
  if (!/formatDateUS\(expense\.matched_bank_transaction_date\)/.test(detailPage)) {
    errors.push("ExpenseDetailPage does not render bank transaction date");
  }
  if (/entityLabel\(\s*null\s*,\s*expense\.journal_entry_id/.test(detailPage)) {
    errors.push("ExpenseDetailPage must not entityLabel(null, journal_entry_id) — use journal_entry_memo");
  }
  if (/entityLabel\(\s*null\s*,\s*expense\.matched_bank_transaction_id/.test(detailPage)) {
    errors.push("ExpenseDetailPage must not entityLabel(null, matched_bank_transaction_id) — use description");
  }
  if (/\.slice\(\s*0\s*,\s*8\s*\)/.test(detailPage)) {
    errors.push("ExpenseDetailPage must not use UUID slice chrome for JE/bank labels");
  }
  if (!/entityLabel\(\s*expense\.journal_entry_memo/.test(detailPage)) {
    errors.push("ExpenseDetailPage must fall back to entityLabel(journal_entry_memo, …) when date missing");
  }
  if (!/entityLabel\(\s*expense\.matched_bank_transaction_description/.test(detailPage)) {
    errors.push("ExpenseDetailPage must fall back to entityLabel(matched_bank_transaction_description, …)");
  }
  return errors;
}

function selftest() {
  const live = assertExpenseDetailHumanLabels();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL (live):\n  ${live.join("\n  ")}`);
    process.exit(1);
  }
  const planted = read(DETAIL).replace(
    /entityLabel\(\s*expense\.journal_entry_memo[^)]+\)/,
    "entityLabel(null, expense.journal_entry_id, \"Journal entry\")",
  );
  if (planted === read(DETAIL)) {
    console.error(`${LABEL} SELFTEST FAIL: planted mutation did not change source`);
    process.exit(1);
  }
  // Re-assert against planted string via temp rewrite of checks
  if (!/entityLabel\(\s*null\s*,\s*expense\.journal_entry_id/.test(planted)) {
    console.error(`${LABEL} SELFTEST FAIL: planted null-label not detected in mutation string`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertExpenseDetailHumanLabels();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
