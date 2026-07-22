#!/usr/bin/env node
/** Guard: Pay Bill bank picker — Combobox + inline + Add new + flat chrome (Accounting 6/M). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "apps/frontend/src/pages/accounting/PayBillModal.tsx");
const src = fs.readFileSync(file, "utf8");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (!src.includes("allowAddNew")) fail("From bank account must use Combobox allowAddNew");
if (!src.includes("+ Add new bank account")) fail("inline + Add new bank account label missing");
if (!src.includes("PlaidLink")) fail("Add-bank drawer must use PlaidLink (canonical bank provision)");
if (!src.includes("pay-bill-add-bank-drawer")) fail("nested add-bank drawer testid missing");
if (src.includes("SelectCombobox") && src.includes("From bank account")) {
  fail("From bank account must not use SelectCombobox (no inline +Create)");
}
// Box-in-box: payment fields must not sit inside a nested bordered grid panel.
if (src.includes('grid grid-cols-1 gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6')) {
  fail("Pay Bill still nests fields in a bordered panel (box-in-box)");
}
console.log("PASS: verify-acct-pay-bill-bank-picker");
