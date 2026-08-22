#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.insurance_claims_reverse","trailer.profile.insurance_claims_reverse"],"task":"FLEET-F5908-INSURANCE-CLAIMS-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const unitDocs = fs.readFileSync("apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx", "utf8");
const driverAssignment = fs.readFileSync("apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx", "utf8");
const trailerAssignment = fs.readFileSync("apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx", "utf8");
const maintenance = fs.readFileSync("apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx", "utf8");
const timeline = fs.readFileSync("apps/frontend/src/components/maintenance/ServiceTimeline.tsx", "utf8");
const trailerProfile = fs.readFileSync("apps/frontend/src/pages/fleet/TrailerProfilePage.tsx", "utf8");
const unitProfile = fs.readFileSync("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", "utf8");
const claimsReverse = fs.readFileSync("apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx", "utf8");
const claimRoutes = fs.readFileSync("apps/backend/src/insurance/claim.routes.ts", "utf8");
const trailerDocs = fs.readFileSync("apps/frontend/src/components/trailer-profile/DocumentsSection.tsx", "utf8");
const fleetMap = fs.readFileSync("docs/specs/scoreboard/modules/fleet.required.json", "utf8");
const feed = fs.readFileSync("docs/specs/scoreboard/wire-sprint-built.json", "utf8");
const self = fs.readFileSync("scripts/verify-fleet-reverse-link-remainder.mjs", "utf8");
const HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.insurance_claims_reverse","trailer.profile.insurance_claims_reverse"],"task":"FLEET-F5908-INSURANCE-CLAIMS-REVERSE-EXACT","vertical":"class-sweep"} */';

function qboMappingRequiresReverse(source) {
  const parsed = JSON.parse(source);
  return parsed.leaves.find((leaf) => leaf.id === "unit.profile.qbo_mapping")?.required.includes("reverse_link") ?? false;
}

function failures(s = {}) {
  const u = s.unitDocs ?? unitDocs;
  const da = s.driverAssignment ?? driverAssignment;
  const ta = s.trailerAssignment ?? trailerAssignment;
  const m = s.maintenance ?? maintenance;
  const tl = s.timeline ?? timeline;
  const tp = s.trailerProfile ?? trailerProfile;
  const up = s.unitProfile ?? unitProfile;
  const cr = s.claimsReverse ?? claimsReverse;
  const routes = s.claimRoutes ?? claimRoutes;
  const td = s.trailerDocs ?? trailerDocs;
  const fm = s.fleetMap ?? fleetMap;
  const fd = s.feed ?? feed;
  const sf = s.self ?? self;
  const found = [
    ["unit document exact drill", u.includes('kind="document" id={row.file_id}')],
    ["default-driver reverse unit drill", da.includes('EntityLinkOrTombstone') && da.includes('id={def.unit_id == null ? null : String(def.unit_id)}') && da.includes('name={def.unit_number}')],
    ["trailer assignment unit drill", ta.includes('EntityLinkOrTombstone') && ta.includes('kind="unit"') && ta.includes('id={String(unit.unit_id)}') && ta.includes('name={unit.unit_number}')],
    ["trailer assignment load drill", ta.includes('EntityLinkOrTombstone') && ta.includes('kind="load"') && ta.includes('id={String(load.load_id)}') && ta.includes('name={load.load_number}')],
    ["trailer maintenance WO drill", /kind="work_order"/.test(m) || m.includes('/maintenance/work-orders/${String(wo.wo_id)}')],
    ["trailer service event drill", tl.includes("navigate(event.detail_path)")],
    ["trailer insurance reverse filter", /InsuranceClaimsReverseSection[\s\S]{0,180}filter=\{\{ trailer_id: id \}\}/.test(tp)],
    ["unit insurance reverse filter", /InsuranceClaimsReverseSection[\s\S]{0,180}filter=\{\{ unit_id: id \}\}/.test(up)],
    ["claims list forwards exact filter", cr.includes("insuranceClaimsApi.list({") && cr.includes("...filter")],
    ["claims drill uses canonical id and governed label", cr.includes('kind="claim"') && cr.includes("id={claim.id}") && cr.includes("entityLabel(claim.claim_number, claim.id, \"Claim\")")],
    ["claims backend retains unit and trailer filters", routes.includes('filters.push(`unit_id = $${values.length}::uuid`)') && routes.includes('filters.push(`trailer_id = $${values.length}::uuid`)') && routes.includes('.replace(/^unit_id/, "assets.unit_id")') && routes.includes('.replace(/^trailer_id/, "c.trailer_id")')],
    ["trailer document exact drill", td.includes('EntityLinkOrTombstone kind="document"') && td.includes('id={d.file_id == null ? null : String(d.file_id)}') && td.includes('name={d.name}')],
    ["trailer governed profile label", tp.includes('const trailerLabel = entityLabel(equipment.equipment_number, id, "Trailer")') && !tp.includes("equipment.equipment_number ?? id")],
    ["trailer upload governed label", td.includes('entityName={entityLabel(equipmentNumber, equipmentId, "Trailer")}') && !td.includes("equipmentNumber ?? equipmentId")],
    ["QBO mapping reverse N/A", !qboMappingRequiresReverse(fm)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
  let matrix;
  try { matrix = JSON.parse(fm); } catch (error) { found.push(`Fleet matrix parse: ${error.message}`); }
  for (const [id, route] of [["unit.profile.insurance_claims_reverse", "/fleet/units/:id"], ["trailer.profile.insurance_claims_reverse", "/fleet/trailers/:id"]]) {
    const leaf = matrix?.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("reverse_link")) found.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== route) found.push(`${id} must name mounted route ${route}`);
  }
  if (!sf.split('import fs from "node:fs";')[0].includes(HEADER)) found.push("exact Fleet insurance-claims header missing");
  try { if (JSON.parse(fd).entries?.some((entry) => entry.guard === "scripts/verify-fleet-reverse-link-remainder.mjs")) found.push("manual feed duplicates Fleet claims ownership"); }
  catch (error) { found.push(`feed parse: ${error.message}`); }
  return found;
}

if (process.argv.includes("--selftest")) {
  const parsed = JSON.parse(fleetMap);
  parsed.leaves.find((leaf) => leaf.id === "unit.profile.qbo_mapping").required.push("reverse_link");
  const checks = [
    failures({ unitDocs: unitDocs.replace('kind="document" id={row.file_id}', 'kind="unit" id={row.file_id}') }).includes("unit document exact drill"),
    failures({ driverAssignment: driverAssignment.replace('name={def.unit_number}', 'name={def.unit_id}') }).includes("default-driver reverse unit drill"),
    failures({ trailerAssignment: trailerAssignment.replace('id={String(unit.unit_id)}', 'id={String(load.load_id)}') }).includes("trailer assignment unit drill"),
    failures({ trailerAssignment: trailerAssignment.replace('name={load.load_number}', 'name={load.load_id}') }).includes("trailer assignment load drill"),
    failures({ maintenance: maintenance.replaceAll('kind="work_order"', 'kind="unit"') }).includes("trailer maintenance WO drill"),
    failures({ trailerProfile: trailerProfile.replace('filter={{ trailer_id: id }}', 'filter={{ unit_id: id }}') }).includes("trailer insurance reverse filter"),
    failures({ unitProfile: unitProfile.replace('InsuranceClaimsReverseSection\n              operatingCompanyId={companyId}\n              filter={{ unit_id: id }}', 'InsuranceClaimsReverseSection\n              operatingCompanyId={companyId}\n              filter={{ trailer_id: id }}') }).includes("unit insurance reverse filter"),
    failures({ claimsReverse: claimsReverse.replace("...filter", "") }).includes("claims list forwards exact filter"),
    failures({ claimsReverse: claimsReverse.replace("id={claim.id}", "id={null}") }).includes("claims drill uses canonical id and governed label"),
    failures({ claimRoutes: claimRoutes.replace('.replace(/^trailer_id/, "c.trailer_id")', '.replace(/^trailer_id/, "c.id")') }).includes("claims backend retains unit and trailer filters"),
    failures({ trailerDocs: trailerDocs.replace('EntityLinkOrTombstone kind="document"', 'EntityLinkOrTombstone kind="trailer"') }).includes("trailer document exact drill"),
    failures({ trailerProfile: trailerProfile.replace('const trailerLabel = entityLabel(equipment.equipment_number, id, "Trailer")', 'const trailerLabel = String(equipment.equipment_number ?? id)') }).includes("trailer governed profile label"),
    failures({ trailerDocs: trailerDocs.replace('entityName={entityLabel(equipmentNumber, equipmentId, "Trailer")}', 'entityName={equipmentNumber ?? equipmentId}') }).includes("trailer upload governed label"),
    failures({ fleetMap: JSON.stringify(parsed) }).includes("QBO mapping reverse N/A"),
    failures({ fleetMap: fleetMap.replace('"id": "unit.profile.insurance_claims_reverse"', '"id": "unit.profile.insurance_claims_reverse.broken"') }).includes("unit.profile.insurance_claims_reverse must require reverse_link"),
    failures({ fleetMap: fleetMap.replace('"id": "trailer.profile.insurance_claims_reverse"', '"id": "trailer.profile.insurance_claims_reverse.broken"') }).includes("trailer.profile.insurance_claims_reverse must require reverse_link"),
    failures({ self: self.replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) }).includes("exact Fleet insurance-claims header missing"),
    failures({ feed: JSON.stringify({ entries: [{ guard: "scripts/verify-fleet-reverse-link-remainder.mjs" }] }) }).includes("manual feed duplicates Fleet claims ownership"),
  ];
  if (checks.some((ok) => !ok)) {
    console.error(`verify-fleet-reverse-link-remainder selftest FAIL — mutations ${checks.map((ok, index) => ok ? null : index + 1).filter(Boolean).join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-fleet-reverse-link-remainder selftest PASS — ${checks.length}/${checks.length} drill/label/applicability mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fleet-reverse-link-remainder FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fleet-reverse-link-remainder PASS — exact unit/trailer claims reverse plus supporting Fleet drills and QBO mapping N/A proven");
