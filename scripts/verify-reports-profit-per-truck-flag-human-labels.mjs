#!/usr/bin/env node
/**
 * verify-reports-profit-per-truck-flag-human-labels.mjs
 * LV-REPORTS-PROFIT-PER-TRUCK-RAW-FLAG-TOKENS
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-profit-per-truck-flag-human-labels";
const LIB = "apps/frontend/src/lib/formatProfitPerTruckFlagLabel.ts";
const PAGE = "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const lib = read(LIB);
  for (const token of ["most_profitable", "least_profitable", "high_maintenance", "underutilized"]) {
    if (!lib.includes(token)) failures.push(`lib must map ${token}`);
  }
  if (!/Most profitable/.test(lib) || !/Underutilized/.test(lib)) {
    failures.push("lib must expose human labels for known flags");
  }
  if (!/Flag — not set/.test(lib)) {
    failures.push("lib must use governed unavailable copy for unknown flags");
  }

  const page = read(PAGE);
  if (!/formatProfitPerTruckFlagLabel|PROFIT_PER_TRUCK_FLAG_LABELS/.test(page)) {
    failures.push("ProfitPerTruckPage must consume shared flag label map");
  }
  // Reject raw token as visible badge label string
  if (/label:\s*"most_profitable"/.test(page) || /label:\s*"underutilized"/.test(page)) {
    failures.push("FLAG_UI must not use raw API tokens as visible labels");
  }
  if (!/PROFIT_PER_TRUCK_FLAG_LABELS\.most_profitable/.test(page)) {
    failures.push("FLAG_UI / filter must pull Most profitable from shared map");
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
      /label:\s*PROFIT_PER_TRUCK_FLAG_LABELS\.most_profitable/,
      'label: "most_profitable"',
    );
    if (bad === original) fail("selftest could not plant raw most_profitable label");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /raw API tokens|Most profitable from shared/.test(m))) {
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
console.log(`${LABEL} PASS — Profit per Truck flags use shared human labels`);
