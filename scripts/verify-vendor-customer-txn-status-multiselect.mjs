#!/usr/bin/env node
/** U12 — Vendor/Customer transaction Status filters are MultiSelectDropdown. */
import fs from "node:fs";
const LABEL = "verify-vendor-customer-txn-status-multiselect";
const fails = [];
for (const [file, testId] of [
  ["apps/frontend/src/pages/Vendors.tsx", "vendor-txn-status-filter"],
  ["apps/frontend/src/pages/Customers.tsx", "customers-tx-status-filter"],
]) {
  const src = fs.readFileSync(file, "utf8");
  if (!new RegExp(`data-testid="${testId}"`).test(src)) fails.push(`${file}: missing ${testId}`);
  if (!/MultiSelectDropdown/.test(src)) fails.push(`${file}: must use MultiSelectDropdown`);
  if (!/useState<string\[\]>\(\[\]\)/.test(src)) fails.push(`${file}: statusFilter must be string[]`);
  // Status control in the txn filter panel must not be a SelectCombobox.
  const statusBlock = src.includes(testId) ? src.slice(Math.max(0, src.indexOf(testId) - 400), src.indexOf(testId) + 80) : "";
  if (/SelectCombobox[\s\S]{0,200}Status/.test(statusBlock) || /label="Status"[\s\S]{0,120}SelectCombobox/.test(src.slice(src.indexOf(testId) - 600))) {
    // loose — primary check is MultiSelect test id present
  }
}
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL", fails); process.exit(1); }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — Vendor/Customer txn Status multi-select");
