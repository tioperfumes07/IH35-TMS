#!/usr/bin/env node
/**
 * Static guard: ExpenseDetailPage must show human-readable labels for JE and
 * bank transaction hops, not bare UUID slices, when the backend supplies them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detailPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx"), "utf8");
const apiTypes = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/accounting.ts"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/expenses.routes.ts"), "utf8");
const errors = [];

if (!/journal_entry_date/.test(apiTypes) || !/journal_entry_memo/.test(apiTypes)) {
  errors.push("ExpenseDetail type missing journal_entry_date / journal_entry_memo");
}
if (!/matched_bank_transaction_date/.test(apiTypes) || !/matched_bank_transaction_description/.test(apiTypes)) {
  errors.push("ExpenseDetail type missing matched_bank_transaction_date / matched_bank_transaction_description");
}
if (!/je\.entry_date/.test(backend)) {
  errors.push("Backend expense detail query does not join journal_entries.entry_date");
}
if (!/bt\.transaction_date/.test(backend)) {
  errors.push("Backend expense detail query does not join bank_transactions.transaction_date/description");
}
if (!/formatDateUS\(expense\.journal_entry_date\)/.test(detailPage)) {
  errors.push("ExpenseDetailPage does not render journal entry date");
}
if (!/formatDateUS\(expense\.matched_bank_transaction_date\)/.test(detailPage)) {
  errors.push("ExpenseDetailPage does not render bank transaction date");
}
if (!/expense\.journal_entry_id\.slice\(0,\s*8\)/.test(detailPage)) {
  errors.push("ExpenseDetailPage missing UUID fallback for journal entry");
}
if (!/expense\.matched_bank_transaction_id\.slice\(0,\s*8\)/.test(detailPage)) {
  errors.push("ExpenseDetailPage missing UUID fallback for bank transaction");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: ExpenseDetailPage JE/bank labels are human-readable with UUID fallback");
process.exit(0);
