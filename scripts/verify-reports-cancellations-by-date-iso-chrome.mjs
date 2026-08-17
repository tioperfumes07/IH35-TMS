#!/usr/bin/env node
/**
 * verify-reports-cancellations-by-date-iso-chrome.mjs
 * LV-REPORTS-CANCELLATIONS-BY-DATE-RAW-ISO
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-cancellations-by-date-iso-chrome";
const PAGE = "apps/frontend/src/pages/reports/CancellationsReportPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const page = read(PAGE);

  if (!/formatDateUS/.test(page) || !/from ["'].*lib\/formatDate["']/.test(page)) {
    failures.push("CancellationsReportPage must import formatDateUS");
  }
  if (!/cancellationsByDateLabel/.test(page) || !/formatAsDate:\s*true/.test(page)) {
    failures.push("By date bucket must use cancellationsByDateLabel via formatAsDate:true");
  }
  if (!/formatAsDate:\s*false/.test(page)) {
    failures.push("non-date buckets must keep formatAsDate:false (reason labels untouched)");
  }
  // Raw ISO passthrough for the date bucket only — reject when formatAsDate path renders row.label bare
  const dateRender = page.match(/if\s*\(formatAsDate\)\s*\{[\s\S]*?return\s*<span[^>]*>\{([^}]+)\}/);
  if (!dateRender) {
    failures.push("missing formatAsDate render branch");
  } else if (/row\.label/.test(dateRender[1]) && !/cancellationsByDateLabel/.test(dateRender[1])) {
    failures.push("By date must not render raw row.label");
  }
  if (!/sortValue:\s*\(row\)\s*=>\s*row\.key/.test(page)) {
    failures.push("By date sort must stay on raw row.key");
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
    let bad = original.replace(
      /if\s*\(formatAsDate\)\s*\{[\s\S]*?return\s*<span className="font-medium text-gray-800">\{cancellationsByDateLabel\(row\)\}<\/span>;/,
      'if (formatAsDate) {\n          return <span className="font-medium text-gray-800">{row.label}</span>;',
    );
    if (bad === original) fail("selftest could not plant raw ISO date label");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /raw row\.label|cancellationsByDateLabel|formatAsDate/.test(m))) {
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
console.log(`${LABEL} PASS — Cancellations By date uses formatDateUS display chrome`);
