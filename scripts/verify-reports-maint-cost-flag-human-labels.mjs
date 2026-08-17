#!/usr/bin/env node
/**
 * verify-reports-maint-cost-flag-human-labels.mjs
 * LV-REPORTS-MAINT-COST-RAW-FLAG-TOKENS
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-maint-cost-flag-human-labels";
const LIB = "apps/frontend/src/lib/formatMaintCostFlagLabel.ts";
const PAGE = "apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const lib = read(LIB);
  for (const token of ["high_cost", "low_cost", "inspection_due", "reliable"]) {
    if (!lib.includes(token)) failures.push(`lib must map ${token}`);
  }
  if (!/High cost/.test(lib) || !/Reliable/.test(lib)) {
    failures.push("lib must expose human labels for known flags");
  }
  if (!/Flag — not set/.test(lib)) {
    failures.push("lib must use governed unavailable copy for unknown flags");
  }

  const page = read(PAGE);
  if (!/formatMaintCostFlagLabel|MAINT_COST_FLAG_LABELS/.test(page)) {
    failures.push("MaintenanceCostPerUnitPage must consume shared flag label map");
  }
  if (/label:\s*"high_cost"/.test(page) || /label:\s*"reliable"/.test(page)) {
    failures.push("FLAG_META must not use raw API tokens as visible labels");
  }
  if (!/MAINT_COST_FLAG_LABELS\.high_cost/.test(page)) {
    failures.push("FLAG_META must pull High cost from shared map");
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
      /label:\s*MAINT_COST_FLAG_LABELS\.high_cost/,
      'label: "high_cost"',
    );
    if (bad === original) fail("selftest could not plant raw high_cost label");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /raw API tokens|High cost from shared/.test(m))) {
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
console.log(`${LABEL} PASS — Maintenance Cost Per Unit flags use shared human labels`);
