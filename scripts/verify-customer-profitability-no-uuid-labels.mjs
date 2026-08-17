#!/usr/bin/env node
/**
 * verify-customer-profitability-no-uuid-labels.mjs
 * LV-REPORTS-CUSTOMER-PROFITABILITY-RAW-UUID-LABELS
 *
 * Report API must never emit UUID-shaped customer_name; FE chart/CSV must use
 * entityLabel (never raw UUID axis labels).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-customer-profitability-no-uuid-labels";
const API = "apps/backend/src/reports/customer-profitability.routes.ts";
const PAGE = "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const api = read(API);
  if (/customer_name:\s*nameMap\.get\(customerId\)\s*\?\?\s*customerId/.test(api)) {
    failures.push("API must not fall back customer_name to raw customerId UUID");
  }
  if (!/Customer — not visible/.test(api)) {
    failures.push('API must tombstone unresolved names as "Customer — not visible"');
  }
  const page = read(PAGE);
  const chart = page.match(/top5Chart\s*=\s*useMemo\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[query\.data\?\.by_customer\]\)/);
  if (!chart) {
    failures.push("top5Chart useMemo missing");
  } else if (!/entityLabel\(r\.customer_name,\s*r\.customer_id,\s*"Customer"\)/.test(chart[1])) {
    failures.push("top5Chart must label via entityLabel(customer_name, customer_id, Customer)");
  }
  if (!/entityLabel\(r\.customer_name,\s*r\.customer_id,\s*"Customer"\)/.test(page)) {
    failures.push("page must use entityLabel for customer display paths");
  }
  const csv = page.match(/function exportCsv\([\s\S]*?\n  \}/);
  if (csv && !/entityLabel\(r\.customer_name,\s*r\.customer_id,\s*"Customer"\)/.test(csv[0])) {
    failures.push("CSV export must use entityLabel, not raw customer_name");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const apiPath = path.join(process.cwd(), API);
  const original = fs.readFileSync(apiPath, "utf8");
  try {
    const bad = original.replace(
      /customer_name:\s*nameMap\.get\(customerId\)\s*\?\?\s*"[^"]+",/,
      "customer_name: nameMap.get(customerId) ?? customerId,",
    );
    if (bad === original) fail("selftest could not plant UUID fallback");
    fs.writeFileSync(apiPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /raw customerId/.test(m))) fail("selftest expected UUID fallback to fail");
  } finally {
    fs.writeFileSync(apiPath, original);
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
console.log(`${LABEL} PASS — customer profitability has no UUID-shaped labels`);
