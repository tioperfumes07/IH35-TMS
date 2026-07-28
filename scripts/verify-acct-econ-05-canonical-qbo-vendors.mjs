#!/usr/bin/env node
/**
 * ACCT-ECON-05 — vendor-credit / CC bill-pay paths must read canonical accounting.qbo_vendors,
 * never RETIRE mdata.qbo_vendors as the AP lookup (Rule 14).
 *
 * Usage: node scripts/verify-acct-econ-05-canonical-qbo-vendors.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-econ-05-canonical-qbo-vendors";

const CC_PAYMENT = "apps/backend/src/bill-payments/cc-payment.routes.ts";
const VENDOR_CREDITS = "apps/backend/src/accounting/vendor-credits.routes.ts";

export function assertCcPayment(src) {
  const problems = [];
  if (/FROM\s+mdata\.qbo_vendors/i.test(src)) {
    problems.push(`${CC_PAYMENT}: still SELECTs RETIRE mdata.qbo_vendors — repoint to accounting.qbo_vendors`);
  }
  if (!/FROM\s+accounting\.qbo_vendors/i.test(src)) {
    problems.push(`${CC_PAYMENT}: must SELECT qbo_id from accounting.qbo_vendors`);
  }
  return problems;
}

export function assertVendorCredits(src) {
  const problems = [];
  if (/FROM\s+mdata\.qbo_vendors/i.test(src) || /INTO\s+mdata\.qbo_vendors/i.test(src)) {
    problems.push(`${VENDOR_CREDITS}: must not touch RETIRE mdata.qbo_vendors`);
  }
  return problems;
}

function main() {
  const cc = fs.readFileSync(path.join(ROOT, CC_PAYMENT), "utf8");
  const vc = fs.readFileSync(path.join(ROOT, VENDOR_CREDITS), "utf8");
  const problems = [...assertCcPayment(cc), ...assertVendorCredits(vc)];
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — CC bill-pay + vendor-credits avoid RETIRE mdata.qbo_vendors; CC reads accounting.qbo_vendors`
  );
}

function selftest() {
  const failures = [];
  const bad = assertCcPayment(`SELECT qbo_id FROM mdata.qbo_vendors WHERE id = $1`);
  if (!bad.some((p) => /RETIRE mdata/.test(p))) failures.push("did not catch retire SELECT");
  const good = assertCcPayment(`SELECT qbo_id FROM accounting.qbo_vendors WHERE id::text = $2`);
  if (good.length) failures.push(`false positive: ${good.join("; ")}`);
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`, failures);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
