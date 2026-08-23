#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["driver"],"leafRe":"^(tab\\.(overview|hos_tracker|hos_viewer|violations|hos_history)|overview\\.credentials_table|fleet\\.hos_board)$","task":"LINK-F5168-COMPLIANCE-DRIVER-WIRING"} */
/** @matrix-built {"modules":["compliance"],"cols":["driver"],"leafRe":"^hop\\.safety_(hos|dot)$","task":"LINK-F5168-COMPLIANCE-HOP-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 9 genuine compliance leaves.
 * tab.overview composes FleetHosBoardSection (real driver_id EntityLink) + ComplianceTable (real
 * ownerEntityKind() dynamic-kind EntityLink, driver-capable, already confirmed in the unit-column
 * sweep). tab.hos_tracker/fleet.hos_board render real driver_id rows. tab.hos_viewer/tab.hos_history
 * use a real EntityPicker kind="driver". tab.violations (HOSViolationsTab.tsx) and the two hop.*
 * safety-module targets (HoursOfServicePage.tsx, DOTComplianceTab.tsx) each render a real
 * driver_id + EntityLink kind="driver".
 *
 * Self-test: node scripts/verify-compliance-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-compliance-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx", /<FleetHosBoardSection operatingCompanyId=\{companyId\} \/>/],
  ["apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx", /<ComplianceTable/],
  ["apps/frontend/src/pages/compliance/HosTrackerSection.tsx", /kind="driver" id=\{driver\.driver_id\}/],
  ["apps/frontend/src/pages/compliance/HosViewerSection.tsx", /<EntityPicker\s*\n\s*kind="driver"/],
  ["apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", /kind="driver" id=\{row\.driver_id as string \| undefined\}/],
  ["apps/frontend/src/pages/compliance/HosHistorySection.tsx", /<EntityPicker\s*\n\s*kind="driver"/],
  ["apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", /kind="driver"[\s\S]{0,20}id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", /kind="driver" id=\{row\.driverId\}/],
  ["apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/backend/src/compliance/missing-required.service.ts", /d\.id = \$1::uuid[\s\S]{0,500}missing_required_dca\.driver_id = d\.id[\s\S]{0,180}missing_required_dca\.company_id = \$2::uuid[\s\S]{0,180}missing_required_dca\.is_authorized = true[\s\S]{0,180}missing_required_dca\.deactivated_at IS NULL/],
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
console.log(`${LABEL} PASS — compliance's driver-scoped HOS/overview leaves and shared-driver required-document reverse read are real`);
