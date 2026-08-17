#!/usr/bin/env node
/**
 * verify-reports-customer-profitability-flag-human-labels.mjs
 * LV-REPORTS-CUSTOMER-PROFITABILITY-RAW-FLAG-TOKENS
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-customer-profitability-flag-human-labels";
const LIB = "apps/frontend/src/lib/formatCustomerProfitabilityFlagLabel.ts";
const PAGE = "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const lib = read(LIB);
  for (const token of ["high_margin", "low_margin", "past_due", "declining_revenue"]) {
    if (!lib.includes(token)) failures.push(`lib must map ${token}`);
  }
  if (!/High margin/.test(lib) || !/Past due/.test(lib) || !/Declining revenue/.test(lib)) {
    failures.push("lib must expose human labels for known flags");
  }
  if (!/Flag — not set/.test(lib)) {
    failures.push("lib must use governed unavailable copy for unknown flags");
  }

  const page = read(PAGE);
  if (!/formatCustomerProfitabilityFlagLabel|CUSTOMER_PROFITABILITY_FLAG_LABELS/.test(page)) {
    failures.push("CustomerProfitabilityPage must consume shared flag label map");
  }
  if (/label:\s*"high_margin"/.test(page) || /label:\s*"past_due"/.test(page)) {
    failures.push("FLAG_UI must not use raw API tokens as visible labels");
  }
  if (!/CUSTOMER_PROFITABILITY_FLAG_LABELS\.high_margin/.test(page)) {
    failures.push("FLAG_UI must pull High margin from shared map");
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
      /label:\s*CUSTOMER_PROFITABILITY_FLAG_LABELS\.high_margin/,
      'label: "high_margin"',
    );
    if (bad === original) fail("selftest could not plant raw high_margin label");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /raw API tokens|High margin from shared/.test(m))) {
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
console.log(`${LABEL} PASS — Customer Profitability flags use shared human labels`);
