#!/usr/bin/env node
/** LST-F103 — AmortizationPage must not swallow list/schedule failures into empty UI. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/finance/AmortizationPage.tsx";
const LABEL = "verify-amortization-load-errors";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/\.catch\(\(\)\s*=>\s*setLoans\(\[\]\)\)/.test(src)) {
    problems.push(`${FILE}: listLoans still silent-empty catch`);
  }
  if (/catch\s*\{\s*setSchedule\(\[\]\)\s*\}/.test(src)) {
    problems.push(`${FILE}: openSchedule still silent-empty catch`);
  }
  if (!/loadError/.test(src) || !/amortization-load-error/.test(src)) {
    problems.push(`${FILE}: must surface loadError with data-testid amortization-load-error`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live
    .replace(/listLoans\([\s\S]*?\.catch\([\s\S]*?\);/, "listLoans(companyId).then((r) => setLoans(r.loans)).catch(() => setLoans([]));")
    .replace(/data-testid="amortization-load-error"/, "");
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
