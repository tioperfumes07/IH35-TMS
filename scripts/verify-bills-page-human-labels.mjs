#!/usr/bin/env node
/** LST-F115 — BillsPage bill chrome must not fall back to id.slice(0, 8). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const LABEL = "verify-bills-page-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/bill\.bill_number\s*\|\|\s*bill\.id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: bill label still uses bill.id.slice(0, 8)`);
  }
  if (/allocationBill\.bill_number\s*\|\|\s*allocationBill\.id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: allocation billLabel still uses id.slice`);
  }
  if (!/entityLabel\(bill\.bill_number,\s*bill\.id,\s*"Bill"\)/.test(src)) {
    problems.push(`${FILE}: must use entityLabel(bill_number, id, Bill)`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live.replace(
    /entityLabel\(bill\.bill_number,\s*bill\.id,\s*"Bill"\)/g,
    "bill.bill_number || bill.id.slice(0, 8)",
  );
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
