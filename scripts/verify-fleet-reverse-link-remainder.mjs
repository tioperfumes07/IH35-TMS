#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^(unit\.profile\.documents|unit\.edit\.quick_availability|trailer\.profile\.(assignment|maintenance|insurance_claims_reverse|documents))$","task":"VERTICAL-REVERSE-LINK-FLEET-REMAINDER"} */
import fs from "node:fs";

const unitDocs = fs.readFileSync("apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx", "utf8");
const edit = fs.readFileSync("apps/frontend/src/components/fleet/EditVehicleModal.tsx", "utf8");
const driverAssignment = fs.readFileSync("apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx", "utf8");
const trailerAssignment = fs.readFileSync("apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx", "utf8");
const maintenance = fs.readFileSync("apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx", "utf8");
const timeline = fs.readFileSync("apps/frontend/src/components/maintenance/ServiceTimeline.tsx", "utf8");
const trailerProfile = fs.readFileSync("apps/frontend/src/pages/fleet/TrailerProfilePage.tsx", "utf8");
const trailerDocs = fs.readFileSync("apps/frontend/src/components/trailer-profile/DocumentsSection.tsx", "utf8");
const fleetMap = fs.readFileSync("docs/specs/scoreboard/modules/fleet.required.json", "utf8");

function qboMappingRequiresReverse(source) {
  const parsed = JSON.parse(source);
  return parsed.leaves.find((leaf) => leaf.id === "unit.profile.qbo_mapping")?.required.includes("reverse_link") ?? false;
}

function failures(s = {}) {
  const u = s.unitDocs ?? unitDocs;
  const e = s.edit ?? edit;
  const da = s.driverAssignment ?? driverAssignment;
  const ta = s.trailerAssignment ?? trailerAssignment;
  const m = s.maintenance ?? maintenance;
  const tl = s.timeline ?? timeline;
  const tp = s.trailerProfile ?? trailerProfile;
  const td = s.trailerDocs ?? trailerDocs;
  const fm = s.fleetMap ?? fleetMap;
  return [
    ["unit document exact drill", u.includes('kind="document" id={row.file_id}')],
    ["quick availability driver FK", e.includes('{ key: "assigned_driver_id", label: "Default Driver", type: "driver", tab: "Quick-availability" }')],
    ["default-driver reverse unit drill", da.includes('kind="unit"') && da.includes('id={String(def.unit_id)}')],
    ["trailer assignment unit drill", ta.includes('EntityLinkOrTombstone') && ta.includes('kind="unit"') && ta.includes('id={String(unit.unit_id)}') && ta.includes('name={unit.unit_number}')],
    ["trailer assignment load drill", ta.includes('EntityLinkOrTombstone') && ta.includes('kind="load"') && ta.includes('id={String(load.load_id)}') && ta.includes('name={load.load_number}')],
    ["trailer maintenance WO drill", /kind="work_order"/.test(m) || m.includes('/maintenance/work-orders/${String(wo.wo_id)}')],
    ["trailer service event drill", tl.includes("navigate(event.detail_path)")],
    ["trailer insurance reverse filter", /InsuranceClaimsReverseSection[\s\S]{0,180}filter=\{\{ trailer_id: id \}\}/.test(tp)],
    ["trailer document exact drill", td.includes('kind="document" id={String(d.file_id)}')],
    ["QBO mapping reverse N/A", !qboMappingRequiresReverse(fm)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const parsed = JSON.parse(fleetMap);
  parsed.leaves.find((leaf) => leaf.id === "unit.profile.qbo_mapping").required.push("reverse_link");
  const checks = [
    failures({ unitDocs: unitDocs.replace('kind="document" id={row.file_id}', 'kind="unit" id={row.file_id}') }).includes("unit document exact drill"),
    failures({ driverAssignment: driverAssignment.replace('id={String(def.unit_id)}', 'id={driverId}') }).includes("default-driver reverse unit drill"),
    failures({ trailerAssignment: trailerAssignment.replace('id={String(unit.unit_id)}', 'id={String(load.load_id)}') }).includes("trailer assignment unit drill"),
    failures({ trailerAssignment: trailerAssignment.replace('name={load.load_number}', 'name={load.load_id}') }).includes("trailer assignment load drill"),
    failures({ maintenance: maintenance.replaceAll('kind="work_order"', 'kind="unit"') }).includes("trailer maintenance WO drill"),
    failures({ trailerProfile: trailerProfile.replace('filter={{ trailer_id: id }}', 'filter={{ unit_id: id }}') }).includes("trailer insurance reverse filter"),
    failures({ trailerDocs: trailerDocs.replace('kind="document" id={String(d.file_id)}', 'kind="trailer" id={String(d.file_id)}') }).includes("trailer document exact drill"),
    failures({ fleetMap: JSON.stringify(parsed) }).includes("QBO mapping reverse N/A"),
  ];
  if (checks.some((ok) => !ok)) {
    console.error(`verify-fleet-reverse-link-remainder selftest FAIL — mutations ${checks.map((ok, index) => ok ? null : index + 1).filter(Boolean).join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-fleet-reverse-link-remainder selftest PASS — 8/8 drill/applicability mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fleet-reverse-link-remainder FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fleet-reverse-link-remainder PASS — six exact fleet leaves + QBO mapping N/A proven");
