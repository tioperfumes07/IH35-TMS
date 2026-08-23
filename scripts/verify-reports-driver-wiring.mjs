#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["driver"],"leafRe":"^(report\\.(settlement_summary|profit_per_truck|trip_profitability|geofence_dwell)|runner\\.driver_pay_history)$","task":"LINK-F5168-REPORTS-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 5 genuine reports leaves, each
 * confirmed live — a real driver_id-columned EntityLink kind="driver" row, or (runner.driver_pay_history)
 * a real driver_select runner-config filter rendering EntityPicker kind="driver".
 *
 * Self-test: node scripts/verify-reports-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reports-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/reports/SettlementSummaryPage.tsx", /kind="driver"[\s\S]{0,20}id=\{r\.driver_id\}/],
  ["apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", /kind="driver"[\s\S]{0,20}id=\{r\.primary_driver_id\}/],
  ["apps/frontend/src/pages/dispatch/TripProfitability.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/reports/GeofenceDwellReport.tsx", /kind="driver" id=\{row\.driver_id \?\? undefined\}/],
  ["apps/backend/src/reports/geofence-dwell.routes.ts", /driver_company_authorizations geofence_dwell_driver_dca[\s\S]{0,360}geofence_dwell_driver_dca\.driver_id = d\.id[\s\S]{0,180}geofence_dwell_driver_dca\.company_id = o\.operating_company_id[\s\S]{0,180}geofence_dwell_driver_dca\.is_authorized = true[\s\S]{0,180}geofence_dwell_driver_dca\.deactivated_at IS NULL/],
  ["apps/frontend/src/pages/reports/runners/runner-config.ts", /\{ type: "driver_select", key: "driver_id", label: "Driver", required: true \}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
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
console.log(`${LABEL} PASS — reports' 5 driver-scoped settlement/profit/trip/geofence/pay-history leaves are real`);
