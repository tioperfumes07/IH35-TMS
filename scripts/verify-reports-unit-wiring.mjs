#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["unit"],"leafRe":"^report\\.(per_truck_cpm|profit_per_truck|fuel_reconciliation|maintenance_cost_per_unit|geofence_dwell|geofence_reconciliation|deadhead)$","task":"LINK-F5167-REPORTS-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 7 genuine reports leaves, each
 * confirmed live — a real unit_id/unit_uuid + EntityLink kind="unit" row, sourced from mdata.units.
 * (The reports.required.json honesty_audit already dropped 2 sibling leaves —
 * runner.fleet_utilization and runner.maint_cost_unit — as FALSE during this same sweep.)
 *
 * Self-test: node scripts/verify-reports-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reports-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/reports/PerTruckCpmReport.tsx", /kind="unit" id=\{row\.unit_uuid\}/],
  ["apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", /kind="unit" id=\{r\.unit_id\}/],
  ["apps/frontend/src/pages/reports/FuelReconciliationPage.tsx", /kind="unit" id=\{r\.unit_id\}/],
  ["apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx", /kind="unit"[\s\S]{0,40}id=\{r\.unit_id\}/],
  ["apps/frontend/src/pages/reports/GeofenceDwellReport.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx", /kind="unit" id=\{f\.unit_id \?\? undefined\}/],
  ["apps/frontend/src/pages/reports/DeadheadReportPage.tsx", /kind="unit" id=\{row\.unit_id\}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real unit_id/EntityLink kind="unit" wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — reports' 7 unit-scoped CPM/profit/fuel/maint/geofence/deadhead leaves are real`);
