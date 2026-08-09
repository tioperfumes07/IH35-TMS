#!/usr/bin/env node
/**
 * Static guard: PaymentDetailPage must use human-readable labels for the
 * deposited-to account and bank transaction hops, not bare UUID slices.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detailPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx"), "utf8");
const apiTypes = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/accounting.ts"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/payments.routes.ts"), "utf8");
const errors = [];

if (!/deposited_to_account_number/.test(apiTypes) || !/deposited_to_account_name/.test(apiTypes)) {
  errors.push("Payment type missing deposited_to_account_number / deposited_to_account_name");
}
if (!/matched_bank_transaction_date/.test(apiTypes)) {
  errors.push("Payment type missing matched_bank_transaction_date");
}
if (!/dep_acct\.account_number/.test(backend)) {
  errors.push("Backend payment detail query does not join catalogs.accounts for deposited_to");
}
if (!/bt\.transaction_date/.test(backend)) {
  errors.push("Backend payment detail query does not join bank_transactions");
}
if (!/function accountLabel/.test(detailPage)) {
  errors.push("PaymentDetailPage missing accountLabel helper");
}
if (!/accountLabel\(\s*payment\.deposited_to_account_name/.test(detailPage)) {
  errors.push("PaymentDetailPage deposited_to label does not use account name/number");
}
if (!/formatDateUS\(payment\.matched_bank_transaction_date\)/.test(detailPage)) {
  errors.push("PaymentDetailPage does not render bank transaction date");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: PaymentDetailPage account + bank labels are human-readable");
process.exit(0);
