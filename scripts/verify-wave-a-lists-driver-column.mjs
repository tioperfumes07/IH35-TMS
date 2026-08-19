#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["driver"],"leafRe":"^catalog\\.drivers\\.teams\\.(list|create)$","task":"WAVE-A-lists-driver-exact-surfaces","vertical":"column-wave"} */
// CC-2 GUARD 2026-08-19: the "primary/secondary driver drill" checks were re-anchored. DriverTeamsPage.tsx
// legitimately extracted a shared DriverTeamMemberCell({row,slot}) component (adds
// LV-LISTS-DRIVER-TEAMS-DEAD-TOMBSTONE-LINK honesty — unresolved/UUID-shaped names render plain text,
// never a dead EntityLink), moving the EntityLink call behind a `driverId` variable instead of the old
// literal `row.primary_driver_id`/`row.secondary_driver_id` inline. Re-anchored to the current shape:
// one check that the cell derives driverId from the right column per slot and renders a real EntityLink
// off it, plus one check per column that its slot="primary"/"secondary" call-site still exists — still
// independently mutation-catchable, still fails if either column's wiring is removed.
import fs from "node:fs";

const checks = [
  // Independently fixed by Codex-1 (c3590c164, "ratchet shared Wave-A driver drills") — same
  // guard-anchor-drift diagnosis CC-2 made (a616eed3c/8210fd005); kept this already-integrated version.
  ["primary driver drill", "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /render: \(row\) => <DriverTeamMemberCell row=\{row\} slot="primary" \/>/],
  ["secondary driver drill", "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /render: \(row\) => <DriverTeamMemberCell row=\{row\} slot="secondary" \/>/],
  ["shared driver drill", "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /slot === "primary" \? row\.primary_driver_id : row\.secondary_driver_id[\s\S]*?<EntityLink\s+kind="driver"\s+id=\{driverId\}/],
  ["primary driver submit FK", "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /primary_driver_id:\s*form\.primary_driver_id!/],
  ["secondary driver submit FK", "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /secondary_driver_id:\s*form\.secondary_driver_id!/],
  ["replacement driver submit FK", "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /new_driver_id:\s*replacementDriverId/],
  ["primary canonical picker", "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /<DriverPickerWithCreate[\s\S]*dataField="primary_driver_id"/],
  ["secondary canonical picker", "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /<DriverPickerWithCreate[\s\S]*dataField="secondary_driver_id"/],
];
const files = [...new Set(checks.map(([, file]) => file))];
const original = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks
    .filter(([, file, pattern]) => !pattern.test(sources.get(file) ?? ""))
    .map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-wave-a-lists-driver-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, file, pattern] of checks) {
    const mutated = new Map(original);
    mutated.set(file, original.get(file).replace(pattern, "__PLANTED_LISTS_DRIVER_DEFECT__"));
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-wave-a-lists-driver-column SELFTEST PASS — ${caught}/${checks.length} exact driver-team mutations detected`);
  process.exit(0);
}

console.log("verify-wave-a-lists-driver-column PASS — Lists driver-team FKs, pickers, replacement, and reverse links ratcheted");
