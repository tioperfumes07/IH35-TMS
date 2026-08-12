#!/usr/bin/env node
/** @matrix-built {"modules":["lists","dispatch","settlements","factoring","banking","customers","vendors","drivers","safety","maintenance","insurance","legal","fuel","fleet","driver-hub","cash-flow","reports","compliance","inventory","eld"],"cols":["unit"],"leafRe":".*","task":"WAVE-A-unit","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/reports/FuelReconciliationPage.tsx", /<EntityLink kind="unit" id=\{r\.unit_id\}/],
  ["apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx", /<EntityLink kind="unit" id=\{r\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", /<EntityLink kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx", /<EntityLink kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx", /unit_id:\s*form\.unitId/],
  ["apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx", /unit_id:\s*unitId/],
  ["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /unit_ids:\s*selectedUnitIds/],
  ["apps/frontend/src/pages/safety/SafetyEventsPage.tsx", /subject_unit_id:\s*draft\.subject_unit_id\.trim\(\)/],
];

const failures = checks
  .filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8")))
  .map(([file]) => `${file}: unit FK/link contract missing`);

if (failures.length) {
  console.error(`verify-wave-a-unit-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-wave-a-unit-column PASS — unit create FKs and reverse links ratcheted across the vertical matrix");
