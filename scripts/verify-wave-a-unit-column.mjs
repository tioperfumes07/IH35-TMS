#!/usr/bin/env node
/** @matrix-built {"modules":["reports","compliance","drivers","dispatch","maintenance","insurance","safety"],"cols":["unit"],"leafRe":"^(report\\.(fuel_reconciliation|profit_per_truck)|fleet\\.hos_board|profiles\\.detail|dispatch\\.wizard\\.border_crossing_wizard_page|maintenance\\.modal\\.road_service_ticket|insurance\\.wizard\\.policy_create|safety_events\\.list)$","task":"WAVE-A-unit-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  // Both migrated onto <EntityLinkOrTombstone kind="unit" id={...} name={...} noun="Unit">
  // (withholds the drill when unresolved — strictly stronger than a bare EntityLink). Accept
  // either primitive. Independently converged fix (CC-2 had the same re-anchor via 01b9b2f5f;
  // kept this already-integrated version).
  ["fuel reconciliation unit drill", "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx", /<EntityLink(?:OrTombstone)?[\s\S]{0,40}?kind="unit"[\s\S]{0,80}?id=\{r\.unit_id\}/],
  ["profit-per-truck unit drill", "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", /<EntityLink kind="unit" id=\{r\.unit_id\}/],
  ["fleet HOS unit drill", "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", /<EntityLink kind="unit" id=\{row\.unit_id\}/],
  ["unit-driver history drill", "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx", /<EntityLink(?:OrTombstone)?[\s\S]{0,40}?kind="unit"[\s\S]{0,80}?id=\{row\.unit_id\}/],
  ["border crossing unit FK", "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx", /unit_id:\s*input\.form\.unitId/],
  ["road-service unit FK", "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx", /unit_id:\s*unitId/],
  ["insurance policy unit FKs", "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /unit_ids:\s*selectedUnitIds/],
  ["safety event unit FK", "apps/frontend/src/pages/safety/SafetyEventsPage.tsx", /subject_unit_id:\s*input\.draft\.subject_unit_id\.trim\(\)\s*\|\|\s*undefined/],
];
const files = [...new Set(checks.map(([, file]) => file))];
const original = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks.filter(([, file, pattern]) => !pattern.test(sources.get(file) ?? "")).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-wave-a-unit-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, file, pattern] of checks) {
    const mutated = new Map(original);
    const allMatches = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    mutated.set(file, original.get(file).replace(allMatches, "__PLANTED_UNIT_COLUMN_DEFECT__"));
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-wave-a-unit-column SELFTEST PASS — ${caught}/${checks.length} exact unit mutations detected`);
  process.exit(0);
}

console.log("verify-wave-a-unit-column PASS — unit create FKs and reverse links ratcheted across the vertical matrix");
