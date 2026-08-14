#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["driver"],"leafRe":"^(roster\\.row\\.edit_unit|unit\\.profile\\.(driver_assign|quick_assign)|unit\\.edit\\.quick_availability|fleet\\.modal\\.quick_assign)$","task":"LINK-F5168-FLEET-DRIVER-ASSIGN-WIRING"} */
/** @matrix-built {"modules":["fleet"],"cols":["driver"],"leafRe":"^(transfers\\.in_progress|map\\.redirect)$","task":"LINK-F5168-FLEET-DRIVER-TRANSFERS-MAP-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 7 genuine fleet leaves.
 * roster.row.edit_unit/unit.edit.quick_availability share EditVehicleModal.tsx's real
 * assigned_driver_id field (type "driver") + EntityPicker kind="driver". unit.profile.driver_assign
 * (DriverAssignmentSection.tsx) links the real default/current driver via EntityLink kind="driver".
 * unit.profile.quick_assign/fleet.modal.quick_assign share QuickAssignModal.tsx's real
 * DriverPickerWithCreate. transfers.in_progress has real from_driver_id/to_driver_id EntityLinks.
 * map.redirect's MapView.tsx has a real driver_uuid URL filter.
 *
 * Self-test: node scripts/verify-fleet-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/components/fleet/EditVehicleModal.tsx", /\{ key: "assigned_driver_id", label: "Default Driver", type: "driver", tab: "Quick-availability" \}/],
  ["apps/frontend/src/components/fleet/EditVehicleModal.tsx", /kind="driver"/],
  ["apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx", /kind="driver"[\s\S]{0,120}id=\{String\(defaultDriver\.id\)\}/],
  ["apps/frontend/src/components/fleet/QuickAssignModal.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx", /kind="driver" id=\{row\.from_driver_id\}/],
  ["apps/frontend/src/pages/dispatch/MapView.tsx", /const focusDriverId = searchParams\.get\("driver"\);/],
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
console.log(`${LABEL} PASS — fleet's 7 driver-scoped assign/transfer/map leaves are real`);
