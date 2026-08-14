#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^load\\.drawer\\.driver_pay$","task":"LINK-F5171-LOAD-DRIVER-PAY-BILL-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — load.drawer.driver_pay reverse: driver bills on the load drawer must EntityLink
 * to the bill record (not plain entityLabel text).
 *
 *
 * Run: node scripts/verify-load-driver-pay-bill-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-driver-pay-bill-entitylink";
const TARGET = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";

function audit(src) {
  const failures = [];
  if (!/from ["'].*EntityLink["']/.test(src) && !/from ["']\.\.\/shared\/EntityLink["']/.test(src)) {
    failures.push(`${TARGET}: must import EntityLink`);
  }
  if (!/kind=["']bill["']/.test(src)) {
    failures.push(`${TARGET}: bill rows must EntityLink kind="bill"`);
  }
  if (!/data-testid=["']load-driver-pay-bill-link["']/.test(src)) {
    failures.push(`${TARGET}: missing data-testid=load-driver-pay-bill-link`);
  }
  // Must not leave a bare entityLabel-only bill span without EntityLink wrap nearby
  if (/<span className="truncate text-xs font-medium text-gray-800">\{entityLabel\(bill\.bill_number/.test(src)) {
    failures.push(`${TARGET}: bill_number still rendered as plain entityLabel span (no drill)`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — live file should pass`);
    process.exit(1);
  }
  const broken = good.replace(/kind=["']bill["']/, 'kind="driver"');
  if (!audit(broken).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted kind regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const failures = audit(src);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — load drawer driver-pay bills EntityLink to bill detail`);
