#!/usr/bin/env node
/** @matrix-built {"modules":["compliance","maintenance","safety"],"cols":["reverse_link"],"leafRe":"^(tab\.hos_tracker|fleet\.hos_board|property_tax\.(list|detail)|form2290|defects\.convert_to_wo|pre_flight_dvir\.queue|fault_drafts\.review|idvr\.list|escrow_record\.list)$","task":"LINK-F5151-COMPLIANCE-MAINTENANCE-RECORD-LINKS","vertical":"class-sweep"} */
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
};

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
    ["fleetHos", '<EntityLink kind="unit" id={row.unit_id}', '<span data-unit={row.unit_id}'],
    ["propertyTax", 'kind="property_tax_rendition"', 'kind="unit"'],
    ["propertyTax", '<EntityLink kind="trailer" id={l.equipment_id}', '<EntityLink kind="unit" id={l.unit_id}'],
    ["form2290", '<EntityLink kind="unit" id={u.unit_id}', '<span data-unit={u.unit_id}'],
    ["defects", 'kind="maintenance_defect"', 'kind="unit"'],
    ["preFlight", 'kind="unit" id={row.unit_id}', 'kind="driver" id={row.driver_id}'],
    ["preFlight", 'kind="work_order"', 'kind="unit"'],
    ["preFlight", "pre-flight-dvir.routes.ts owns queue + severity", "backend is not built"],
    ["faultDrafts", 'kind="work_order"', 'kind="unit"'],
    ["faultDrafts", "selected.wo_title ?? selected.display_id", "selected.id"],
    ["idvr", 'kind="work_order"', 'kind="unit"'],
    ["idvr", 'navigate(`/safety/idvr/${encodeURIComponent(id)}`)', 'navigate("/safety/idvr")'],
    ["escrow", 'data-testid={`escrow-driver-link-${row.id}`}', 'data-testid="broken-escrow-link"'],
    ["complianceMatrix", '"id": "tab.hos_tracker"', '"id": "tab.hos_tracker.broken"'],
    ["maintenanceMatrix", '"id": "defects.convert_to_wo"', '"id": "defects.convert_to_wo.broken"'],
    ["safetyMatrix", '"id": "idvr.list"', '"id": "idvr.list.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: compliance and maintenance records reverse-drill across Compliance, Maintenance, and Safety");
