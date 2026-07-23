#!/usr/bin/env node
/**
 * Accounting-module A/P aging Open bills drill must use server has_balance (includes partial),
 * not legacy status=unpaid — mirrors RPT-PAR-1 / reports APAgingPage contract.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx"),
  "utf8"
);
const drill = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/reports/agingDrillThrough.ts"),
  "utf8");

const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (page.includes("status=unpaid")) {
  fail("AccountsPayableAgingPage must not deep-link bills with status=unpaid");
}
if (!page.includes("apAgingBillsListHref")) {
  fail("AccountsPayableAgingPage must use apAgingBillsListHref for Open bills links");
}
if (!drill.includes("has_balance: \"true\"")) {
  fail("agingDrillThrough apAgingBillsListHref must set has_balance=true");
}

console.log("PASS: verify-acct-ap-aging-module-has-balance");
