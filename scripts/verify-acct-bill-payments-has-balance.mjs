#!/usr/bin/env node
/**
 * Bill payments list pay-bill picker must load open bills via has_balance (includes partial),
 * not legacy status=unpaid pseudo-status.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx"),
  "utf8"
);

const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (page.includes('status: "unpaid"') || page.includes("status: 'unpaid'")) {
  fail("BillPaymentsListPage must not list bills with status=unpaid");
}
if (!page.includes("has_balance: true")) {
  fail("BillPaymentsListPage bills query must pass has_balance: true");
}

console.log("PASS: verify-acct-bill-payments-has-balance");
