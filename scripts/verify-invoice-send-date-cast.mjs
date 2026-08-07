#!/usr/bin/env node
/**
 * GUARD: ACCT-F100 — invoice-send.service.ts must cast issue_date to YYYY-MM-DD,
 * never via raw String(Date) which produces verbose format not castable to SQL ::date.
 *
 * Root cause: String(current.issue_date) on a JS Date object → "Mon Aug 03 2026..."
 * which fails when passed as $3::date to the NOA factor-assignment query.
 *
 * This guard asserts the fix remains in place: toISOString().slice(0, 10) or equivalent
 * safe date extraction.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SELFTEST = process.argv.includes("--selftest");
const FILE = resolve("apps/backend/src/accounting/invoice-send.service.ts");

if (SELFTEST) {
  // Self-test: verify this script can find the safe pattern in a synthetic string
  const safe = `const invoiceDate = current.issue_date instanceof Date\n    ? current.issue_date.toISOString().slice(0, 10)\n    : String(current.issue_date).slice(0, 10);`;
  if (!/toISOString\(\)\.slice\(0,\s*10\)/.test(safe)) {
    console.error("SELFTEST FAIL: safe pattern not detected");
    process.exit(1);
  }
  // Verify dangerous pattern is caught
  const dangerous = `const invoiceDate = String(current.issue_date);`;
  if (/toISOString\(\)\.slice\(0,\s*10\)/.test(dangerous)) {
    console.error("SELFTEST FAIL: dangerous pattern falsely matched");
    process.exit(1);
  }
  console.log("SELFTEST PASS");
  process.exit(0);
}

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch {
  console.error(`FAIL: cannot read ${FILE}`);
  process.exit(1);
}

// The file must contain the safe date extraction pattern
if (!/toISOString\(\)\.slice\(0,\s*10\)/.test(src)) {
  console.error(
    "FAIL: invoice-send.service.ts does not contain toISOString().slice(0, 10) for issue_date.\n" +
    "Raw String(Date) produces verbose format not castable to SQL ::date.\n" +
    "See ACCT-F100 / audit row 620."
  );
  process.exit(1);
}

// The file must NOT contain the bare dangerous pattern (String(current.issue_date) without slice)
const bareStringDate = /const\s+invoiceDate\s*=\s*String\(current\.issue_date\)\s*;/;
if (bareStringDate.test(src)) {
  console.error(
    "FAIL: invoice-send.service.ts still has bare `String(current.issue_date)` without .slice(0,10).\n" +
    "This produces verbose Date format not castable to SQL ::date."
  );
  process.exit(1);
}

console.log("PASS: invoice-send date cast uses safe toISOString().slice(0, 10)");
