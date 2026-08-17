#!/usr/bin/env node
/**
 * verify-reports-cash-flow-overview-iso-axis.mjs
 * LV-REPORTS-CASH-FLOW-OVERVIEW-RAW-ISO-AXIS
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-cash-flow-overview-iso-axis";
const PAGE = "apps/frontend/src/pages/reports/CashFlowOverviewPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const page = read(PAGE);
  if (!/formatDateUS/.test(page) || !/from ["'].*lib\/formatDate["']/.test(page)) {
    failures.push("CashFlowOverviewPage must import formatDateUS");
  }
  if (!/<XAxis[^>]*dataKey="date"[^>]*tickFormatter=\{[^}]*formatDateUS/.test(page)
    && !/<XAxis dataKey="date"[^>]*tickFormatter=\{\(v\) => formatDateUS\(v\)/.test(page)) {
    failures.push('projection XAxis dataKey="date" must use formatDateUS tickFormatter');
  }
  if (/<XAxis dataKey="date" tick=\{\{ fontSize: 10 \}\} \/>/.test(page)) {
    failures.push("bare XAxis dataKey=date without tickFormatter is forbidden");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const bad = original.replace(
      /<XAxis dataKey="date" tick=\{\{ fontSize: 10 \}\} tickFormatter=\{\(v\) => formatDateUS\(v\) \|\| String\(v\)\} \/>/,
      '<XAxis dataKey="date" tick={{ fontSize: 10 }} />',
    );
    if (bad === original) fail("selftest could not plant bare XAxis");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /tickFormatter|bare XAxis/.test(m))) {
      fail(`selftest expected page fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Cash Flow Overview projection X-axis uses formatDateUS`);
