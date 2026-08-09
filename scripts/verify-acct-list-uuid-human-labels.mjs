#!/usr/bin/env node
/** LST-F130 — Invoices/RevRec/SalesTax/FixedAssets/FactorRecon/Allocations: no UUID-slice on touched labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKS = [
  ["apps/frontend/src/pages/accounting/InvoicesListPage.tsx", /source_load_id\.slice\(0,\s*8\)/],
  ["apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx", /load_id\.slice\(0,\s*8\)/],
  ["apps/frontend/src/pages/accounting/SalesTaxPage.tsx", /paid_bill_id\.slice\(0,\s*8\)/],
  ["apps/frontend/src/pages/accounting/FixedAssetsPage.tsx", /unit_uuid\.slice\(0,\s*8\)/],
  ["apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx", /invoice_id\.slice\(0,\s*8\)/],
  ["apps/frontend/src/pages/accounting/AllocationsPage.tsx", /bill_id\.slice\(0,\s*8\)/],
];
const LABEL = "verify-acct-list-uuid-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(srcs) {
  const problems = [];
  for (const [file, re] of CHECKS) {
    const src = srcs[file];
    if (re.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  return problems;
}

const read = () => Object.fromEntries(CHECKS.map(([f]) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[CHECKS[0][0]] = planted[CHECKS[0][0]].replace(
    /entityLabel\(null,\s*row\.source_load_id,\s*"Load"\)/,
    "row.source_load_id.slice(0, 8)",
  );
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assert(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
