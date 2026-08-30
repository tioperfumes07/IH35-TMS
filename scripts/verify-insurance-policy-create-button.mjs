#!/usr/bin/env node
// @matrix-built {"modules":["insurance"],"cols":["connectivity"],"leaves":["policies.create"],"task":"INSURANCE-POLICY-CREATOR-READ-FAILURE-TRUTH"}
/** Ratchets the policy-list create action through its canonical modal submit. */
import fs from "node:fs";

const FILES = {
  policies: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  modal: "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
};
const CHECKS = [
  ["policies:create-label", "policies", /\+ Create policy/],
  ["policies:modal-mounted", "policies", /PolicyCreateModal/],
  ["policies:owner-rbac", "policies", /Owner/],
  ["policies:administrator-rbac", "policies", /Administrator/],
  ["policies:accountant-rbac", "policies", /Accountant/],
  ["modal:type-catalog", "modal", /listInsuranceTypeCatalog/],
  ["modal:canonical-units", "modal", /<EntityPicker[\s\S]{0,180}kind=["']unit["'][\s\S]{0,260}operatingCompanyId=\{operatingCompanyId\}/],
  ["modal:create-endpoint", "modal", /\/api\/v1\/insurance\/policies/],
  ["modal:create-title", "modal", /title="Create Policy"/],
  ["modal:type-error-truth", "modal", /typesQuery\.isError[\s\S]{0,240}Couldn't load coverage types[\s\S]{0,240}typesQuery\.refetch/],
  ["modal:unit-picker-change", "modal", /onChange=\{addCoveredUnit\}/],
  ["modal:selected-unit-labels", "modal", /selectedUnits\.map\(\(unit\)[\s\S]{0,500}\{unit\.label\} ×/],
  ["modal:submit-fails-closed", "modal", /disabled=\{createMutation\.isPending \|\| typesQuery\.isError\}/],
];

export function collectProblems(sources) {
  return CHECKS.filter(([, key, pattern]) => !pattern.test(sources[key] ?? "")).map(([id]) => id);
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
}

function selftest() {
  const baseline = readSources();
  const missed = [];
  for (const [id, key, pattern] of CHECKS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const mutated = { ...baseline, [key]: baseline[key].replace(new RegExp(pattern.source, flags), "__PLANTED_DEFECT__") };
    if (!collectProblems(mutated).includes(id)) missed.push(id);
  }
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-insurance-policy-create-button --selftest ${CHECKS.length}/${CHECKS.length}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = collectProblems(readSources());
  if (failures.length) {
    console.error(`verify-insurance-policy-create-button FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-insurance-policy-create-button PASS — visible RBAC action→honest canonical catalog/unit reads→real policy endpoint");
}
