#!/usr/bin/env node
/**
 * verify-reports-fuel-reconciliation-display-dates.mjs
 * LV-REPORTS-FUEL-RECONCILIATION-RAW-ISO-DATES
 *
 * Unmatched Card + WO date columns must render via formatDateUS (MM/DD/YYYY),
 * while sortValue keeps raw ISO for ordering.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-fuel-reconciliation-display-dates";
const PAGE = "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/from ["']\.\.\/\.\.\/lib\/formatDate["']/.test(src) || !/formatDateUS/.test(src)) {
    failures.push(`${PAGE}: must import formatDateUS`);
  }
  // Card transaction_date consumer
  if (!/key:\s*["']transaction_date["'][\s\S]{0,220}?formatDateUS\(\s*row\.transaction_date\s*\)/.test(src)) {
    failures.push(`${PAGE}: unmatched Card transaction_date must render via formatDateUS(row.transaction_date)`);
  }
  if (!/key:\s*["']transaction_date["'][\s\S]{0,220}?sortValue:\s*\(row\)\s*=>\s*row\.transaction_date/.test(src)) {
    failures.push(`${PAGE}: unmatched Card transaction_date must keep sortValue on raw ISO`);
  }
  // WO wo_date consumer
  if (!/key:\s*["']wo_date["'][\s\S]{0,220}?formatDateUS\(\s*row\.wo_date\s*\)/.test(src)) {
    failures.push(`${PAGE}: unmatched WO wo_date must render via formatDateUS(row.wo_date)`);
  }
  if (!/key:\s*["']wo_date["'][\s\S]{0,220}?sortValue:\s*\(row\)\s*=>\s*row\.wo_date/.test(src)) {
    failures.push(`${PAGE}: unmatched WO wo_date must keep sortValue on raw ISO`);
  }
  // bare columns without render (regression shape)
  if (/key:\s*["']transaction_date["']\s*,\s*label:\s*["']Date["']\s*,\s*sortable:\s*true\s*\}/.test(src)) {
    failures.push(`${PAGE}: transaction_date must not be a bare ParityTable column`);
  }
  if (/key:\s*["']wo_date["']\s*,\s*label:\s*["']Date["']\s*,\s*sortable:\s*true\s*\}/.test(src)) {
    failures.push(`${PAGE}: wo_date must not be a bare ParityTable column`);
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const original = read(PAGE);
  // Plant Card omission independently, entirely in memory.
  let planted = original.replace(
    /key:\s*["']transaction_date["'][\s\S]*?render:\s*\(row\)\s*=>\s*\(row\.transaction_date \? formatDateUS\(row\.transaction_date\) : ["']—["']\)\s*\},/,
    '{ key: "transaction_date", label: "Date", sortable: true },',
  );
  const badCard = analyze(planted);
  if (!badCard.some((m) => /transaction_date must render/.test(m) || /bare ParityTable/.test(m))) {
    fail(`selftest Card omission expected fail, got: ${badCard.join("; ") || "none"}`);
  }
  // Plant WO omission independently from original, entirely in memory.
  planted = original.replace(
    /key:\s*["']wo_date["'][\s\S]*?render:\s*\(row\)\s*=>\s*\(row\.wo_date \? formatDateUS\(row\.wo_date\) : ["']—["']\)\s*\},/,
    '{ key: "wo_date", label: "Date", sortable: true },',
  );
  const badWo = analyze(planted);
  if (!badWo.some((m) => /wo_date must render/.test(m) || /bare ParityTable/.test(m))) {
    fail(`selftest WO omission expected fail, got: ${badWo.join("; ") || "none"}`);
  }
  const good = analyze(original);
  if (good.length) fail(`selftest expected GOOD source: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze(read(PAGE));
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — fuel recon unmatched dates use formatDateUS (ISO sort preserved)`);
}

main();
