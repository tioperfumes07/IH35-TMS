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
    if (!/<EntityPicker[\s\S]{0,180}kind="unit"[\s\S]{0,260}operatingCompanyId=\{operatingCompanyId\}/.test(source)) found.push(`${key} lacks canonical company-scoped Unit picker`);
    if (!/selectedUnits\.map\(\(unit\)[\s\S]{0,500}\{unit\.label\} ×/.test(source)) found.push(`${key} lacks resolved Unit label chips`);
    if (/include:\s*"trailers"/.test(source)) found.push(`${key} still advertises equipment trailers to policy_unit`);
  }
  if (!candidate.modal.includes("unitIds: selectedUnits.map((unit) => unit.value)")) found.push("modal no longer submits selected canonical unit IDs");
  if (!candidate.wizard.includes("unit_ids: selectedUnits.map((unit) => unit.value)")) found.push("wizard no longer submits selected canonical unit IDs");
  if (!candidate.modal.includes("unit.value === unitId")) found.push("modal unit selection no longer deduplicates canonical unit ID");
  if (!candidate.wizard.includes("unit.value === unitId")) found.push("wizard unit selection no longer deduplicates canonical unit ID");
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["modal", 'kind="unit"', 'kind="trailer"', "modal canonical picker"],
    ["wizard", 'kind="unit"', 'kind="trailer"', "wizard canonical picker"],
    ["modal", 'kind="unit"\n            operatingCompanyId={operatingCompanyId}', 'kind="unit"\n            operatingCompanyId={""}', "modal company scope"],
    ["wizard", 'kind="unit"\n              operatingCompanyId={operatingCompanyId}', 'kind="unit"\n              operatingCompanyId={""}', "wizard company scope"],
    ["modal", "{unit.label} ×", "Unit ×", "modal resolved label"],
    ["wizard", "{unit.label} ×", "Unit ×", "wizard resolved label"],
    ["modal", "unitIds: selectedUnits.map((unit) => unit.value)", "unitIds: []", "modal unit FK payload"],
    ["wizard", "unit_ids: selectedUnits.map((unit) => unit.value)", "unit_ids: []", "wizard unit FK payload"],
    ["modal", "unit.value === unitId", "unit.label === unitId", "modal canonical selection"],
    ["wizard", "unit.value === unitId", "unit.label === unitId", "wizard canonical selection"],
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
