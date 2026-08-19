#!/usr/bin/env node
/** @matrix-built {"modules":["compliance","safety","drivers","insurance","dispatch","fleet","legal","maintenance"],"cols":["driver","unit","work_order","connectivity","reverse_link"],"leafRe":"^(tab\\.violations|safety\\.(drawer|parity)\\.accident_report|profiles\\.detail|claims\\.list|load\\.detail|unit\\.profile\\.(identity|legal_reverse|insurance_claims_reverse)|trailer\\.profile\\.(legal_reverse|insurance_claims_reverse)|matters\\.list|wo\\.console\\.list|home\\.rm_status_board|maintenance\\.modal\\.(work_order_detail|work_order_create|create_work_order))$","task":"NONMONEY-ENTITY-LABEL-GENERIC-RECORD-NOUN","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-nonmoney-exact-entity-nouns";
const paths = {
  eld: "apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx",
  accident: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  fines: "apps/frontend/src/components/safety/DriverFinesReverseSection.tsx",
  claimsReverse: "apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx",
  mattersReverse: "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx",
  matterList: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
  woModal: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
  vehicle: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  claims: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
  woPage: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  dtc: "apps/frontend/src/pages/maintenance/components/DtcAutoWorkOrdersCard.tsx",
  woCreate: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
};
const files = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

const required = [
  ["eld", 'entityLabel(row.driver_name, id, "Driver")'],
  ["accident", 'entityLabel(typeof rec.display_id === "string" ? rec.display_id : null, id, "Work order")'],
  ["accident", 'entityLabel(typeof row.display_id === "string" ? row.display_id : null, rid, "Work order")'],
  ["accident", 'entityLabel(displayId, woId, "Work order")'],
  ["fines", 'entityLabel(f.violation_code ?? f.jurisdiction, id, "Fine")'],
  ["fines", 'entityLabel(f.reason_code, id, "Internal fine")'],
  ["claimsReverse", 'entityLabel(claim.claim_number, claim.id, "Claim")'],
  ["mattersReverse", 'noun="Legal matter"'],
  ["matterList", 'entityLabel(row.matter_number, row.id, "Legal matter")'],
  ["woModal", 'entityLabel(workOrder.display_id, workOrder.id, "Work order")'],
  ["vehicle", 'entityLabel(unit?.unit_number, id, "Unit")'],
  ["claims", 'entityLabel(m.matter_number, m.id, "Legal matter")'],
  ["claims", 'entityLabel(i.incident_type ? `Incident ${i.incident_type}` : null, i.id, "Incident")'],
  ["woPage", 'entityLabel(wo?.display_id, id, "Work order")'],
  ["dtc", 'entityLabel(row.display_id, row.id, "Work order")'],
  ["woCreate", 'entityLabel(createdWO.display_id, createdWO.uuid, "Work order")'],
];

function failures(candidate = files) {
  const found = [];
  for (const [key, needle] of required) if (!candidate[key].includes(needle)) found.push(`${paths[key]}: missing ${needle}`);
  for (const key of Object.keys(candidate).filter((key) => key !== "woPage")) {
    const source = candidate[key];
    if (/entityLabel\([^\n]{0,180},\s*"Record"\)/.test(source)) found.push(`${paths[key]}: generic Record noun remains on governed entity surface`);
  }
  if (!candidate.claimsReverse.includes('EntityLinkOrTombstone') || !candidate.claimsReverse.includes('kind="claim"') || !candidate.claimsReverse.includes("id={claim.id}") || !candidate.claimsReverse.includes('noun="Claim"')) found.push("claim reverse loses canonical resolved/tombstoned drill");
  if (!candidate.mattersReverse.includes("name={m.matter_number}")) found.push("legal-matter reverse loses canonical human identity");
  if (!candidate.mattersReverse.includes("const id = m.id == null ? null : String(m.id)")) found.push("legal-matter reverse manufactures an empty historical record id");
  if (!candidate.mattersReverse.includes('kind="matter"') || !candidate.mattersReverse.includes("id={id}")) found.push("legal-matter reverse loses canonical EntityLink");
  if (!candidate.dtc.includes('kind="work_order"') || !candidate.dtc.includes("id={row.id}")) found.push("DTC work-order drill loses canonical EntityLink");
  if (!candidate.woCreate.includes('kind="work_order"') || !candidate.woCreate.includes("id={createdWO.uuid}")) found.push("created work order loses canonical EntityLink");
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const escaped = [];
  for (const [key, needle] of required) {
    if (!files[key].includes(needle)) { escaped.push(`${key}: mutation anchor missing`); continue; }
    const replacement = needle.includes("entityLabel(")
      ? needle.replace(/"(?:Driver|Work order|Fine|Internal fine|Claim|Legal matter|Unit|Incident)"\)$/, '"Record")')
      : needle.replace(/Legal matter/g, "Record");
    const mutant = { ...files, [key]: files[key].replace(needle, replacement) };
    if (mutant[key] === files[key] || failures(mutant).length === 0) escaped.push(`${key}: planted generic noun escaped (${needle})`);
  }
  const drillMutations = [
    ["claimsReverse", 'kind="claim"', 'kind="load"'],
    ["mattersReverse", 'kind="matter"', 'kind="claim"'],
    ["mattersReverse", 'name={m.matter_number}', 'name={m.id}'],
    ["mattersReverse", 'const id = m.id == null ? null : String(m.id)', 'const id = String(m.id ?? "")'],
    ["dtc", 'kind="work_order"', 'kind="unit"'],
    ["woCreate", 'id={createdWO.uuid}', 'id={createdWO.display_id}'],
  ];
  for (const [key, needle, replacement] of drillMutations) {
    const mutant = { ...files, [key]: files[key].replaceAll(needle, replacement) };
    if (mutant[key] === files[key] || failures(mutant).length === 0) escaped.push(`${key}: planted drill defect escaped`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${required.length + drillMutations.length}/${required.length + drillMutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — canonical non-money surfaces expose exact entity identity across eight modules`);
