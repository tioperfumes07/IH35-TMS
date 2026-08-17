#!/usr/bin/env node
/**
 * LV-FUEL-HISTORY-RAW-ISO-DATETIME — Fuel History Date column must use formatDateUS.
 * @matrix-built {"modules":["fuel"],"cols":["qbo_chrome"],"leafRe":"^history\\.list$","task":"LV-FUEL-HISTORY-RAW-ISO-DATETIME"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx";
const LABEL = "verify-fuel-history-transaction-date-display";
const SELFTEST = process.argv.includes("--selftest");

function assertFuelHistoryDate(src) {
  const problems = [];
  if (!/formatDateUS/.test(src) || !/from ["'].*formatDate["']/.test(src)) {
    problems.push(`${FILE}: must import formatDateUS`);
  }
  if (!/key:\s*["']transaction_date["']/.test(src)) {
    problems.push(`${FILE}: must keep transaction_date column`);
  }
  if (!/render:\s*\(row\)\s*=>\s*formatDateUS\(row\.transaction_date\)/.test(src)) {
    problems.push(`${FILE}: transaction_date column must render via formatDateUS(row.transaction_date)`);
  }
  // bare ParityTable column with no render dumps ISO — forbid that shape for this key
  if (/{\s*key:\s*["']transaction_date["']\s*,\s*label:\s*["']Date["']\s*,\s*sortable:\s*true\s*}/.test(src)) {
    problems.push(`${FILE}: bare transaction_date column without render is forbidden (ISO leak)`);
  }
  return problems;
}

const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const bad = real
    .replace(/import \{ formatDateUS \} from ["'][^"']+["'];\n?/, "")
    .replace(
      /{\s*key:\s*["']transaction_date["'][\s\S]*?},/,
      '{ key: "transaction_date", label: "Date", sortable: true },',
    );
  const badHits = assertFuelHistoryDate(bad);
  const goodHits = assertFuelHistoryDate(real);
  if (badHits.length === 0 || goodHits.length !== 0) {
    console.error(`${LABEL} --selftest FAIL`, { badHits, goodHits });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const problems = assertFuelHistoryDate(real);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(" -", p);
  process.exit(1);
}
console.log(`${LABEL} PASS — Fuel History Date uses formatDateUS`);
