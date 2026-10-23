#!/usr/bin/env node
// ACCT-F443265E5 — guard that driver bills flow through accounting.bills (single source, no double-count)
// after the accrued_bill_id link is set. Three invariants checked in the cash-flow service:
//  1. billsPromise includes bill_category IN ('vendor','driver') — linked driver A/P bills appear once
//  2. driverBillsPromise excludes accrued_bill_id IS NOT NULL — unlinked driver bills only
//  3. projected-cash-date.ts exports driverBillCashDueDateSql — due_date clamping function present
// Run: node scripts/verify-driver-bill-due-date-projected-delivery.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-bill-due-date-projected-delivery";
const CF_FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const DT_FILE = "apps/backend/src/cash-flow/projected-cash-date.ts";

export function analyze(cfSrc, dtSrc) {
  const failures = [];

  // 1. billsPromise must include driver bills (not just vendor)
  if (!/bill_category IN \('vendor',\s*'driver'\)/.test(cfSrc)) {
    failures.push(
      `${CF_FILE}: billsPromise does not include bill_category IN ('vendor','driver') — ` +
      `linked driver A/P bills are excluded from the rolling ledger, causing double-count ` +
      `or omission. Change 'vendor' to IN ('vendor','driver').`
    );
  }

  // 2. driverBillsPromise must gate on accrued_bill_id IS NULL so linked bills are not double-counted
  if (!/accrued_bill_id IS NULL/.test(cfSrc)) {
    failures.push(
      `${CF_FILE}: driverBillsPromise is missing 'accrued_bill_id IS NULL' guard — ` +
      `linked driver bills (already shown via accounting.bills) would appear twice in the ledger.`
    );
  }

  // 3. projected-cash-date.ts must export driverBillCashDueDateSql (due_date clamping for driver bills)
  if (!/export\s+function\s+driverBillCashDueDateSql/.test(dtSrc)) {
    failures.push(
      `${DT_FILE}: driverBillCashDueDateSql is not exported — driver bill due_date clamping ` +
      `function is missing. The cash-flow service needs it to bucket overdue driver bills correctly.`
    );
  }

  return failures;
}

function selftest() {
  const cfReal = readFileSync(path.join(ROOT, CF_FILE), "utf8");
  const dtReal = readFileSync(path.join(ROOT, DT_FILE), "utf8");

  const good = analyze(cfReal, dtReal);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — real files should pass:\n` + good.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }

  // Mutation 1: revert billsPromise to vendor-only
  const cfWithVendorOnly = cfReal.replace(
    /bill_category IN \('vendor',\s*'driver'\)/,
    "bill_category = 'vendor'"
  );
  if (cfWithVendorOnly === cfReal) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: IN ('vendor','driver') anchor not found`);
    process.exit(1);
  }
  const f1 = analyze(cfWithVendorOnly, dtReal);
  if (!f1.some((f) => f.includes("IN ('vendor','driver')"))) {
    console.error(`${LABEL} SELFTEST FAILED: removing driver from billsPromise was not caught`);
    process.exit(1);
  }

  // Mutation 2: remove all accrued_bill_id IS NULL guards (both driverBillsPromise and any other caller)
  const cfWithoutDedup = cfReal.replaceAll("AND db.accrued_bill_id IS NULL", "");
  if (cfWithoutDedup === cfReal) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: accrued_bill_id IS NULL anchor not found`);
    process.exit(1);
  }
  const f2 = analyze(cfWithoutDedup, dtReal);
  if (!f2.some((f) => f.includes("accrued_bill_id IS NULL"))) {
    console.error(`${LABEL} SELFTEST FAILED: removing accrued_bill_id IS NULL was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS (2/2 planted regressions caught, real files clean)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const cfSrc = readFileSync(path.join(ROOT, CF_FILE), "utf8");
  const dtSrc = readFileSync(path.join(ROOT, DT_FILE), "utf8");
  const failures = analyze(cfSrc, dtSrc);
  if (failures.length) {
    console.error(`${LABEL} FAILED:\n` + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — driver bills in billsPromise (IN vendor/driver), accrued_bill_id IS NULL dedup present, driverBillCashDueDateSql exported.`
  );
}
