#!/usr/bin/env node
/**
 * Guard: Vendor Bill TotalsStack tax is display-only — grand = line subtotal (13/22).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

const stack = fs.readFileSync(path.join(root, "apps/frontend/src/components/forms/shared/TotalsStack.tsx"), "utf8");
const bill = fs.readFileSync(path.join(root, "apps/frontend/src/components/accounting/VendorBillForm.tsx"), "utf8");

if (!stack.includes("taxDisplayOnly")) fail("TotalsStack must support taxDisplayOnly");
if (!stack.includes("taxDisplayOnly ? subtotal : subtotal + taxAmount")) {
  fail("taxDisplayOnly must set grand total = subtotal");
}
if (!bill.includes("taxDisplayOnly")) fail("VendorBillForm must pass taxDisplayOnly");
if (!bill.includes("Bill Total = sum of lines")) fail("VendorBillForm grand label must state sum of lines");

console.log("PASS: verify-acct-bill-total-tax-display-only");
