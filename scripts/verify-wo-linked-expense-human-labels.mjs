#!/usr/bin/env node
/** LST-F111 — WorkOrderDetailPage linked expense hops must not use bare UUID slice labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const LABEL = "verify-wo-linked-expense-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/label=\{expense\.id\.slice\(0,\s*8\)\}/.test(src)) {
    problems.push(`${FILE}: linked expense still uses expense.id.slice(0, 8)`);
  }
  if (!/kind="expense"/.test(src) || !/entityLabel\(/.test(src) || !/expense\.memo/.test(src)) {
    problems.push(`${FILE}: expense label must use entityLabel(memo|date, id, Expense)`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live.replace(
    /label=\{entityLabel\(\s*expense\.memo[\s\S]*?\)\}/,
    "label={expense.id.slice(0, 8)}",
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
