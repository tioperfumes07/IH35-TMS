#!/usr/bin/env node
/** Guard: CC Bill Payment — ReferenceSelect createKind=account + flat chrome (Accounting 17/22). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx");
const src = fs.readFileSync(file, "utf8");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (!src.includes("ReferenceSelect")) fail("CC liability account must use ReferenceSelect");
if (!src.includes('createKind="account"')) fail("CC liability account must use ReferenceSelect createKind=account");
if (!src.includes("listCatalogAccounts")) fail("CC bill payment must load catalogs.accounts (listCatalogAccounts), not banking bank_accounts");
if (src.includes("getAllAccounts")) fail("CC bill payment must not use banking getAllAccounts — backend validates catalogs.accounts");
if (src.includes("SelectCombobox") && /Credit card|CC account/i.test(src)) {
  fail("CC liability account must not use SelectCombobox (no inline +Create)");
}
if (!src.includes("CC Bill Payment Details")) fail("flat section header missing (Pay Bill chrome parity)");
if (src.includes('grid grid-cols-1 gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6')) {
  fail("CC Bill Payment still nests fields in a bordered panel (box-in-box)");
}
if (!src.includes("ParityDrawer")) fail("CCPaymentModal must use ParityDrawer");
console.log("PASS: verify-acct-cc-bill-payment-picker");
