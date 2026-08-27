#!/usr/bin/env node
// ACCOUNTING-HUB-FIND-TRANSACTIONS-BILL-PAYMENT-LABEL-IGNORES-AVAILABLE-VENDOR-NAME — guard
//
// AccountingHubPage.tsx's "FIND TRANSACTIONS" widget built its bill-payment row label from only
// reference_number/check_number/memo -- three optional free-text fields that are commonly blank on
// routine payments -- rendering "Payment — not visible" even though the backend's listBillPayments()
// already resolves and returns vendor_name + bill_number on every row (the same API response
// BillPaymentsListPage.tsx already correctly consumes for its own Vendor column). This guard fails if
// the widget's label formula stops preferring vendor_name/bill_number before the free-text fallbacks.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";

export function check(text) {
  const failures = [];
  const labelCallRe =
    /label:\s*entityLabel\(\s*row\.vendor_name\s*\|\|\s*row\.bill_number\s*\|\|\s*row\.reference_number\s*\|\|\s*row\.check_number\s*\|\|\s*row\.memo\s*,\s*row\.id\s*,\s*"Payment"\s*,?\s*\)/;
  if (!labelCallRe.test(text)) {
    failures.push(
      `${FILE} "FIND TRANSACTIONS" bill-payment label no longer prefers row.vendor_name/row.bill_number before the reference_number/check_number/memo fallbacks`,
    );
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: accounting-hub-find-transactions-vendor-name");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Accounting Hub 'FIND TRANSACTIONS' bill-payment rows prefer the already-resolved vendor_name/bill_number over blank free-text fields");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    'entityLabel(\n          row.vendor_name || row.bill_number || row.reference_number || row.check_number || row.memo,\n          row.id,\n          "Payment",\n        )',
    'entityLabel(row.reference_number || row.check_number || row.memo, row.id, "Payment")',
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to free-text-only label) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
