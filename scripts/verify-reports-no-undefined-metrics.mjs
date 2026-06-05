#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const target = path.join(repoRoot, "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx");

if (!fs.existsSync(target)) {
  console.error("[verify-reports-no-undefined-metrics] FAIL: FuelReconciliationPage.tsx missing");
  process.exit(1);
}

const source = fs.readFileSync(target, "utf8");
const failures = [];

if (!source.includes("unmatched_count ?? 0") && !source.includes("unmatched_count ??0")) {
  failures.push("FuelReconciliationPage must coerce totals.unmatched_count with ?? 0");
}
if (source.includes("String(query.data.totals.unmatched_count)") && !source.includes("?? 0")) {
  failures.push("FuelReconciliationPage renders raw unmatched_count (undefined → 'undefined' label)");
}

if (failures.length > 0) {
  console.error("[verify-reports-no-undefined-metrics] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-reports-no-undefined-metrics] OK");
