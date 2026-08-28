#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["unit","connectivity"],"leafRe":"^(policies\\.create|insurance\\.(modal|parity|wizard)\\.policy_create)$","task":"INSURANCE-POLICY-UNIT-FALLBACK-WRONG-NOUN","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-insurance-policy-unit-honest-label";
const files = {
  modal: fs.readFileSync("apps/frontend/src/components/insurance/PolicyCreateModal.tsx", "utf8"),
  wizard: fs.readFileSync("apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", "utf8"),
};

function failures(candidate = files) {
  const found = [];
  for (const [key, source] of Object.entries(candidate)) {
    if (!source.includes('entityLabel(unit.unit_number, unit.id, "Unit")')) found.push(`${key} lacks exact Unit identity fallback`);
    if (source.includes('entityLabel(unit.unit_number, unit.id, "Record")')) found.push(`${key} still exposes generic Record identity copy`);
    if (!/listAllUnits\(\{[\s\S]{0,300}?operating_company_id:\s*operatingCompanyId[\s\S]{0,300}?include:\s*"trailers"/.test(source)) found.push(`${key} unit roster is not exhaustively company scoped with trailers`);
  }
  if (!candidate.modal.includes("unitIds: selectedUnitIds")) found.push("modal no longer submits selected canonical unit IDs");
  if (!candidate.wizard.includes("unit_ids: selectedUnitIds")) found.push("wizard no longer submits selected canonical unit IDs");
  if (!candidate.modal.includes("toggleUnit(unit.id)")) found.push("modal unit selection no longer uses canonical unit ID");
  if (!candidate.wizard.includes("prev.includes(unit.id)") || !candidate.wizard.includes("[...prev, unit.id]")) found.push("wizard unit selection no longer uses canonical unit ID");
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["modal", 'entityLabel(unit.unit_number, unit.id, "Unit")', 'entityLabel(unit.unit_number, unit.id, "Record")', "modal noun"],
    ["wizard", 'entityLabel(unit.unit_number, unit.id, "Unit")', 'entityLabel(unit.unit_number, unit.id, "Record")', "wizard noun"],
    ["modal", "listAllUnits({\n        operating_company_id: operatingCompanyId", "listAllUnits({\n        operating_company_id: ''", "modal company scope"],
    ["wizard", "listAllUnits({\n        operating_company_id: operatingCompanyId", "listAllUnits({\n        operating_company_id: ''", "wizard company scope"],
    ["modal", 'include: "trailers"', 'include: undefined', "modal trailer coverage"],
    ["wizard", 'include: "trailers"', 'include: undefined', "wizard trailer coverage"],
    ["modal", "unitIds: selectedUnitIds", "unitIds: []", "modal unit FK payload"],
    ["wizard", "unit_ids: selectedUnitIds", "unit_ids: []", "wizard unit FK payload"],
    ["modal", "toggleUnit(unit.id)", "toggleUnit(unit.unit_number)", "modal canonical selection"],
    ["wizard", "[...prev, unit.id]", "[...prev, unit.unit_number]", "wizard canonical selection"],
  ];
  const escaped = [];
  for (const [key, needle, replacement, name] of mutations) {
    if (!files[key].includes(needle)) { escaped.push(`${key}: mutation anchor missing (${name})`); continue; }
    const mutant = { ...files, [key]: files[key].replace(needle, replacement) };
    if (failures(mutant).length === 0) escaped.push(`${key}: planted defect escaped (${name})`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — both Insurance policy creators use honest Unit identity and preserve canonical unit FKs`);
