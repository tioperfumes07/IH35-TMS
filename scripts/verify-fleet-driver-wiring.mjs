#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["driver"],"leafRe":"^(roster\\.row\\.edit_unit|unit\\.profile\\.(driver_assign|quick_assign)|unit\\.edit\\.quick_availability|fleet\\.modal\\.quick_assign)$","task":"LINK-F5168-FLEET-DRIVER-ASSIGN-WIRING"} */
/** @matrix-built {"modules":["fleet"],"cols":["driver"],"leafRe":"^(transfers\\.in_progress|map\\.redirect)$","task":"LINK-F5168-FLEET-DRIVER-TRANSFERS-MAP-WIRING"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.quick_assign"],"task":"FLEET-F5915-QUICK-ASSIGN-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.driver_assign","unit.profile.quick_assign","unit.edit.quick_availability","transfers.in_progress","map.redirect"],"task":"FLEET-F5944-DRIVER-ASSIGNMENT-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
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
const REQUIRED = "docs/specs/scoreboard/modules/fleet.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-fleet-driver-wiring.mjs";
const EXACT_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.quick_assign"],"task":"FLEET-F5915-QUICK-ASSIGN-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_LEAVES = ["unit.profile.driver_assign", "unit.profile.quick_assign", "unit.edit.quick_availability", "transfers.in_progress", "map.redirect"];
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.driver_assign","unit.profile.quick_assign","unit.edit.quick_availability","transfers.in_progress","map.redirect"],"task":"FLEET-F5944-DRIVER-ASSIGNMENT-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

const CHECKS = [
  ["apps/frontend/src/components/fleet/EditVehicleModal.tsx", /\{ key: "assigned_driver_id", label: "Default Driver", type: "driver", tab: "Quick-availability" \}/],
  ["apps/frontend/src/components/fleet/EditVehicleModal.tsx", /kind="driver"/],
  ["apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx", /kind="driver"[\s\S]{0,120}id=\{String\(defaultDriver\.id\)\}/],
  ["apps/frontend/src/components/fleet/QuickAssignModal.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx", /kind="driver" id=\{row\.from_driver_id\}/],
  ["apps/frontend/src/pages/dispatch/MapView.tsx", /const focusDriverId = searchParams\.get\("driver"\);/],
  ["apps/frontend/src/components/fleet/QuickAssignModal.tsx", /DriverPickerWithCreate[\s\S]{0,120}operatingCompanyId=\{companyId\}/],
  ["apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", /target=\{\{ equipmentKind: "truck", equipmentId: id, equipmentLabel: unitNumber \}\}[\s\S]{0,260}quicksaveEquipmentAssignment\(\{[\s\S]{0,180}equipment_id: id,[\s\S]{0,80}driver_id: driverId/],
  ["apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", /invalidateQueries\(\{ queryKey: \["unit-profile", id, companyId\] \}\)/],
  ["apps/backend/src/assignments/quicksave.routes.ts", /setScopedCompanyContext\(client, user\.uuid, companyId\)/],
  ["apps/backend/src/assignments/quicksave.routes.ts", /d\.status = 'Active'[\s\S]{0,220}dca\.company_id = \$2::uuid[\s\S]{0,100}dca\.is_authorized = true/],
  ["apps/backend/src/assignments/quicksave.routes.ts", /FROM mdata\.units[\s\S]{0,160}owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid/],
  ["apps/backend/src/assignments/quicksave.routes.ts", /INSERT INTO telematics\.vehicle_driver_assignments[\s\S]{0,220}'manual_override', true/],
  ["apps/backend/src/assignments/quicksave.routes.ts", /UPDATE mdata\.units[\s\S]{0,100}SET assigned_driver_id = \$3::uuid[\s\S]{0,160}owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid/],
  ["apps/backend/src/assignments/quicksave.routes.ts", /appendCrudAudit\(client, user\.uuid, "assignments\.quicksave_truck"/],
  ["apps/backend/src/mdata/unit-aggregate.service.ts", /FROM telematics\.vehicle_driver_assignments vda[\s\S]{0,180}vda\.unit_id = \$1::uuid[\s\S]{0,100}vda\.operating_company_id = \$2::uuid[\s\S]{0,100}vda\.is_default = true[\s\S]{0,80}vda\.ended_at IS NULL/],
  ["apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx", /EntityLinkOrTombstone kind="driver" id=\{String\(defaultDriver\.id\)\} name=\{defaultDriver\.name\}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
  }
  let leaf;
  const connectivityRows = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.id === "unit.profile.quick_assign" && Array.isArray(value.required)) leaf = value;
      if (CONNECTIVITY_LEAVES.includes(value.id) && Array.isArray(value.required)) connectivityRows.set(value.id, value);
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(files[REQUIRED]));
  if (!leaf) failures.push(`${REQUIRED}: unit.profile.quick_assign missing`);
  else {
    if (!leaf.required.includes("reverse_link")) failures.push(`${REQUIRED}: quick assign must require reverse_link`);
    if (leaf.route_hint !== "/fleet/units/:id") failures.push(`${REQUIRED}: quick assign must mount on canonical unit profile`);
  }
  if (!files[SELF].split("/**\n * OWNER-")[0].includes(EXACT_HEADER)) failures.push(`${SELF}: exact quick-assign reverse header missing`);
  for (const id of CONNECTIVITY_LEAVES) if (!connectivityRows.get(id)?.required?.includes("connectivity")) failures.push(`${REQUIRED}: ${id} must require connectivity`);
  if (!files[SELF].split("/**\n * OWNER-")[0].includes(CONNECTIVITY_HEADER)) failures.push(`${SELF}: exact driver-assignment connectivity header missing`);
  if (/"guard"\s*:\s*"scripts\/verify-fleet-driver-wiring\.mjs"/.test(files[FEED])) failures.push(`${FEED}: manual feed duplicates quick-assign reverse ownership`);
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  const result = Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
  for (const file of [REQUIRED, FEED, SELF]) result[file] = fs.readFileSync(path.join(root, file), "utf8");
  return result;
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
  const evidence = [
    ["leaf", REQUIRED, /"unit\.profile\.quick_assign"/, '"unit.profile.quick_assign_MISSING"'],
    ["reverse", REQUIRED, /("id": "unit\.profile\.quick_assign"[\s\S]{0,260})"reverse_link"/, '$1"reverse_link_MISSING"'],
    ["route", REQUIRED, /("id": "unit\.profile\.quick_assign"[\s\S]{0,180})"\/fleet\/units\/:id"/, '$1"/fleet/trailers/:id"'],
    ["header", SELF, EXACT_HEADER, EXACT_HEADER.replace("reverse_link", "connectivity")],
    ["connectivity-header", SELF, CONNECTIVITY_HEADER, CONNECTIVITY_HEADER.replace("connectivity", "driver")],
    ["feed", FEED, /\[\s*/, `[\n  {"guard":"scripts/verify-fleet-driver-wiring.mjs"},`],
  ];
  for (const [name, file, pattern, replacement] of evidence) {
    const mutated = { ...good, [file]: good[file].replace(pattern, replacement) };
    if (mutated[file] === good[file] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} evidence mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  for (const id of CONNECTIVITY_LEAVES) {
    const mutated = { ...good, [REQUIRED]: good[REQUIRED].replace(`"id": "${id}"`, `"id": "${id}_MISSING"`) };
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${id} connectivity mutation escaped`);
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
