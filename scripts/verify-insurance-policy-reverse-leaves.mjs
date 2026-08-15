#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link"],"leafRe":"^(policies\\.detail|coverage_gaps)$","task":"INSURANCE-POLICY-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.profile$","task":"INSURANCE-POLICY-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\\.detail\\.insurance$","task":"INSURANCE-POLICY-REVERSE-LEAVES","vertical":"column-wave"} */

import fs from "node:fs";

const files = {
  policy: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  gaps: "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
  vendor: "apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx",
  unit: "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx",
};
const checks = [
  ["policy detail company scope", "policy", /getInsurancePolicy\(policyId!, companyId\)/],
  ["policy assigned-unit drill", "policy", /kind="unit"/],
  ["policy retryable read failure", "policy", /Couldn't load policy details[\s\S]*policyQuery\.refetch\(\)/],
  ["coverage gaps company scope", "gaps", /getInsuranceCoverageGaps\(companyId(?:,\s*unitId)?\)/],
  ["coverage gap unit drill", "gaps", /kind="unit"/],
  ["coverage gaps honest retry", "gaps", /if \(failedQuery\)[\s\S]*coverageGapsQuery\.refetch\(\)[\s\S]*policiesQuery\.refetch\(\)/],
  ["vendor reverse FK filter", "vendor", /vendor_id: vendorId/],
  ["vendor policy drill", "vendor", /kind="insurance_policy"[\s\S]*id=\{policy\.id\}|policies\/\$\{policy\.id\}/],
  ["vendor reverse retry", "vendor", /Couldn't load this vendor's insurance policies[\s\S]*query\.refetch\(\)/],
  ["unit profile policy drill", "unit", /kind="insurance_policy"[\s\S]*id=\{policy\.policy_id\}/],
];
const original = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks
    .filter(([, key, pattern]) => !pattern.test(sources[key]))
    .map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-insurance-policy-reverse-leaves: FAIL\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, pattern] of checks) {
    const allMatches = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    const mutated = { ...original, [key]: original[key].replace(allMatches, "__PLANTED_INSURANCE_REVERSE_DEFECT__") };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify-insurance-policy-reverse-leaves SELFTEST PASS — ${caught}/${checks.length} exact reverse-link mutations detected`);
  process.exit(0);
}

console.log(`verify-insurance-policy-reverse-leaves: PASS — ${checks.length} policy reverse-link invariants`);
