#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["driver"],"leafRe":"^catalog\\.drivers\\.teams\\.(list|create)$","task":"WAVE-A-lists-driver-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /<EntityLink kind="driver" id=\{row\.primary_driver_id\} label=\{driverTeamMemberName\(row, "primary"\)\}/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /<EntityLink kind="driver" id=\{row\.secondary_driver_id\} label=\{driverTeamMemberName\(row, "secondary"\)\}/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /primary_driver_id:\s*form\.primary_driver_id!/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /secondary_driver_id:\s*form\.secondary_driver_id!/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /new_driver_id:\s*replacementDriverId/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /<DriverPickerWithCreate[\s\S]*dataField="primary_driver_id"/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /<DriverPickerWithCreate[\s\S]*dataField="secondary_driver_id"/],
];

const failures = checks
  .filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8")))
  .map(([file]) => `${file}: driver FK/link contract missing`);

if (failures.length) {
  console.error(`verify-wave-a-lists-driver-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-wave-a-lists-driver-column PASS — Lists driver-team FKs, pickers, replacement, and reverse links ratcheted");
