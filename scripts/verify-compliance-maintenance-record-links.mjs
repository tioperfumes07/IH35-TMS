#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leaves":["tab.hos_tracker","fleet.hos_board","property_tax.list","property_tax.detail","form2290"],"task":"CLASS-F5886-COMPLIANCE-MAINTENANCE-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leaves":["defects.convert_to_wo","pre_flight_dvir.queue","fault_drafts.review"],"task":"CLASS-F5886-COMPLIANCE-MAINTENANCE-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["idvr.list","escrow_record.list"],"task":"CLASS-F5886-COMPLIANCE-MAINTENANCE-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  hosService: "apps/backend/src/telematics/hos-tracker.service.ts",
  hosApi: "apps/frontend/src/api/hosTracker.ts",
  hosTracker: "apps/frontend/src/pages/compliance/HosTrackerSection.tsx",
  fleetHos: "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx",
  propertyTax: "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx",
  form2290: "apps/frontend/src/pages/compliance/Form2290Filings.tsx",
  defects: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx",
  preFlight: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx",
  faultDrafts: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
  idvr: "apps/frontend/src/pages/safety/IdvrPage.tsx",
  escrow: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
  complianceMatrix: "docs/specs/scoreboard/modules/compliance.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  safetyMatrix: "docs/specs/scoreboard/modules/safety.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-compliance-maintenance-record-links.mjs",
};

const HEADERS = [
  '/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leaves":["tab.hos_tracker","fleet.hos_board","property_tax.list","property_tax.detail","form2290"],"task":"CLASS-F5886-COMPLIANCE-MAINTENANCE-REVERSE-EXACT","vertical":"class-sweep"} */',
  '/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leaves":["defects.convert_to_wo","pre_flight_dvir.queue","fault_drafts.review"],"task":"CLASS-F5886-COMPLIANCE-MAINTENANCE-REVERSE-EXACT","vertical":"class-sweep"} */',
  '/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["idvr.list","escrow_record.list"],"task":"CLASS-F5886-COMPLIANCE-MAINTENANCE-REVERSE-EXACT","vertical":"class-sweep"} */',
];

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const REQUIRED_LEAVES = {
  complianceMatrix: ["tab.hos_tracker", "fleet.hos_board", "property_tax.list", "property_tax.detail", "form2290"],
  maintenanceMatrix: ["defects.convert_to_wo", "pre_flight_dvir.queue", "fault_drafts.review"],
  safetyMatrix: ["idvr.list", "escrow_record.list"],
};

export function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("hosService", "u.id::text AS unit_id", "HOS roster backend must project the company-scoped assigned unit FK");
  need("hosService", "unit_id: r.unit_id", "HOS roster response must retain the assigned unit FK");
  need("hosApi", "unit_id: string | null", "HOS frontend contract must type the unit FK");
  need("hosTracker", '<EntityLinkOrTombstone kind="unit" id={driver.unit_id}', "HOS Tracker Unit column must reverse-drill canonically");
  need("hosTracker", 'kind="driver" id={driver.driver_id}', "HOS Tracker Driver column must reverse-drill canonically");
  need("fleetHos", '<EntityLink kind="unit" id={row.unit_id}', "Fleet HOS board must drill to units");
  need("fleetHos", 'kind="driver"', "Fleet HOS board must drill to drivers");
  need("propertyTax", 'kind="property_tax_rendition"', "property-tax list must drill to rendition detail via EntityLink");
  need("propertyTax", "id={r.id}", "property-tax list EntityLink must use the rendition row id");
  need("propertyTax", '<EntityLink kind="unit" id={l.unit_id}', "property-tax detail must drill to units");
  need("propertyTax", '<EntityLink kind="trailer" id={l.equipment_id}', "property-tax detail must drill to trailers");
  need("form2290", '<EntityLink kind="unit" id={u.unit_id}', "Form 2290 exceptions must drill to units");
  need("defects", 'kind="maintenance_defect"', "DVIR defect queue must drill to defect detail via EntityLink");
  need("defects", "id={row.id}", "DVIR defect queue EntityLink must use the defect row id");
  need("preFlight", 'kind="unit" id={row.unit_id}', "pre-flight queue must drill to units");
  need("preFlight", 'kind="work_order"', "pre-flight queue must drill to routed work orders");
  need("preFlight", "pre-flight-dvir.routes.ts owns queue + severity", "pre-flight queue must not claim its mounted backend is missing");
  need("faultDrafts", 'kind="unit" id={row.unit_id}', "fault drafts must drill to units");
  need("faultDrafts", 'kind="work_order"', "fault draft review must drill to work-order detail");
  // The fake "Draft WO" placeholder is gone (2026-08-20, CC-3) — this now feeds EntityLinkOrTombstone's
  // `name` prop, which already has its own honest "Work order — not visible" fallback (entityLabel())
  // when neither wo_title nor display_id resolves. A hardcoded generic string here would just paint
  // over that real gap instead of letting the shared honesty fallback do its job.
  need(
    "faultDrafts",
    "selected.wo_title ?? selected.display_id",
    "fault draft review title must prefer the canonical WO display ID without exposing a UUID fallback",
  );
  need("idvr", 'kind="work_order"', "iDVIR list must drill to follow-up work orders");
  need("idvr", 'navigate(`/safety/idvr/${encodeURIComponent(id)}`)', "iDVIR rows must drill to inspection detail");
  need("escrow", 'data-testid={`escrow-driver-link-${row.id}`}', "escrow roster must drill to canonical drivers");
  for (const [key, ids] of Object.entries(REQUIRED_LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`${key}:${id} must inventory reverse_link`);
    }
  }
  for (const header of HEADERS) if (!source.self.split("\n").includes(header)) failures.push(`exact Built header missing: ${header}`);
  if ((JSON.parse(source.feed).entries ?? []).some((entry) => entry.guard === FILES.self)) failures.push("duplicate manual Built feed remains");
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("compliance/maintenance record-link guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["hosService", "u.id::text AS unit_id", "NULL::text AS unit_id"],
    ["hosService", "unit_id: r.unit_id", "unit_id: null"],
    ["hosApi", "unit_id: string | null", "unit_id_broken: string | null"],
    ["hosTracker", '<EntityLinkOrTombstone kind="unit" id={driver.unit_id}', '<EntityLinkOrTombstone kind="driver" id={driver.driver_id}'],
    ["hosTracker", 'kind="driver" id={driver.driver_id}', 'kind="unit" id={driver.unit_id}'],
    ["fleetHos", '<EntityLink kind="unit" id={row.unit_id}', '<span data-unit={row.unit_id}'],
    ["fleetHos", 'kind="driver"', 'kind="unit"'],
    ["propertyTax", 'kind="property_tax_rendition"', 'kind="unit"'],
    ["propertyTax", "id={r.id}", "id={r.unit_id}"],
    ["propertyTax", '<EntityLink kind="unit" id={l.unit_id}', '<span data-unit={l.unit_id}'],
    ["propertyTax", '<EntityLink kind="trailer" id={l.equipment_id}', '<EntityLink kind="unit" id={l.unit_id}'],
    ["form2290", '<EntityLink kind="unit" id={u.unit_id}', '<span data-unit={u.unit_id}'],
    ["defects", 'kind="maintenance_defect"', 'kind="unit"'],
    ["preFlight", 'kind="unit" id={row.unit_id}', 'kind="driver" id={row.driver_id}'],
    ["preFlight", 'kind="work_order"', 'kind="unit"'],
    ["preFlight", "pre-flight-dvir.routes.ts owns queue + severity", "backend is not built"],
    ["faultDrafts", 'kind="work_order"', 'kind="unit"'],
    ["faultDrafts", 'kind="unit" id={row.unit_id}', 'kind="work_order" id={row.id}'],
    ["faultDrafts", "selected.wo_title ?? selected.display_id", "selected.id"],
    ["idvr", 'kind="work_order"', 'kind="unit"'],
    ["idvr", 'navigate(`/safety/idvr/${encodeURIComponent(id)}`)', 'navigate("/safety/idvr")'],
    ["escrow", 'data-testid={`escrow-driver-link-${row.id}`}', 'data-testid="broken-escrow-link"'],
    ...Object.entries(REQUIRED_LEAVES).flatMap(([key, ids]) => ids.map((id) => [key, `"id": "${id}"`, `"id": "${id}.broken"`])),
    ...HEADERS.map((header) => ["self", header, `${header}.broken`]),
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ task: "BROKEN", guard: FILES.self, modules: ["maintenance"], cols: ["reverse_link"], leafRe: ".*" });
  if (!verify({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("self-test feed mutation survived");
  console.log(`PASS: ${mutations.length + 1} planted defects were rejected`);
}
console.log("PASS: compliance and maintenance records reverse-drill across Compliance, Maintenance, and Safety");
