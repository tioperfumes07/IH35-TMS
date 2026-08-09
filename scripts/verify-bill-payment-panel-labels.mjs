#!/usr/bin/env node
/**
 * Static guard: BillPaymentDetailPage must use human-readable labels for JE and
 * bank transaction hops, not bare UUID slices, when metadata is available.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detailPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx"), "utf8");
const apiTypes = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/accounting.ts"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/bills.service.ts"), "utf8");
const errors = [];

if (!/journal_entry_date/.test(apiTypes) || !/journal_entry_memo/.test(apiTypes)) {
  errors.push("BillPayment type missing journal_entry_date / journal_entry_memo");
}
if (!/matched_bank_transaction_date/.test(apiTypes) || !/matched_bank_transaction_description/.test(apiTypes)) {
  errors.push("BillPayment type missing matched_bank_transaction_date / matched_bank_transaction_description");
}
if (!/je\.entry_date/.test(backend)) {
  errors.push("Backend bill payment detail query does not join journal_entries.entry_date");
}
if (!/bt\.transaction_date/.test(backend)) {
  errors.push("Backend bill payment detail query does not join bank_transactions.transaction_date/description");
}
if (!/formatDateUS\(payment\.journal_entry_date\)/.test(detailPage)) {
  errors.push("BillPaymentDetailPage does not render journal entry date");
}
if (!/formatDateUS\(payment\.matched_bank_transaction_date\)/.test(detailPage)) {
  errors.push("BillPaymentDetailPage does not render bank transaction date");
}
if (!/payment\.journal_entry_id\.slice\(0,\s*8\)/.test(detailPage)) {
  errors.push("BillPaymentDetailPage missing UUID fallback for journal entry");
}
if (!/payment\.matched_bank_transaction_id\.slice\(0,\s*8\)/.test(detailPage)) {
  errors.push("BillPaymentDetailPage missing UUID fallback for bank transaction");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: BillPaymentDetailPage JE/bank labels are human-readable with UUID fallback");
process.exit(0);
