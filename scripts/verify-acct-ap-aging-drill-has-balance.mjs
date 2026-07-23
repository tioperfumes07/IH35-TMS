#!/usr/bin/env node
/**
 * verify-acct-ap-aging-drill-has-balance.mjs — Accounting Full Audit 21/22
 *
 * AccountsPayableAgingPage must drill to bills list with has_balance=true (includes partial),
 * not status=unpaid-only — same contract as agingDrillThrough + verify-mgmt-report-aging-drill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-ap-aging-drill-has-balance";
const PAGE = "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx";
const DRILL = "apps/frontend/src/pages/reports/agingDrillThrough.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check() {
  const failures = [];
  const page = read(PAGE);
  const drill = read(DRILL);

  if (!/apAgingBillsListHref/.test(page)) {
    failures.push(`${PAGE}: must import and use apAgingBillsListHref for Open bills links`);
  }
  if (/status=unpaid|status:\s*["']unpaid["']/.test(page)) {
    failures.push(`${PAGE}: must not use status=unpaid for aging drill (misses partial balances)`);
  }
  if (!/has_balance:\s*["']true["']/.test(drill)) {
    failures.push(`${DRILL}: apAgingBillsListHref must use has_balance=true`);
  }
  if (!/Open bills/.test(page)) {
    failures.push(`${PAGE}: Open bills drill label must remain`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodPage = `
    import { apAgingBillsListHref } from "../reports/agingDrillThrough";
    <Link to={apAgingBillsListHref(v.vendor_id)}>Open bills</Link>
  `;
  const badPage = goodPage.replace("apAgingBillsListHref", "`/accounting/bills?vendor_id=${v.vendor_id}&status=unpaid`");
  if (check().length !== 0) {
    console.error(`${LABEL} --selftest: live tree unexpected fail`);
    process.exit(1);
  }
  const planted = check();
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
