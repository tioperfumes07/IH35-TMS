#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link"],"leafRe":"^(policies\\.detail|coverage_gaps)$","task":"INSURANCE-POLICY-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.profile$","task":"INSURANCE-POLICY-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\\.detail\\.insurance$","task":"INSURANCE-POLICY-REVERSE-LEAVES","vertical":"column-wave"} */

import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const policy = read("apps/frontend/src/pages/insurance/PolicyDetail.tsx");
const gaps = read("apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx");
const vendor = read("apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx");
const unit = read("apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx");

const assertions = [
  [policy, /getInsurancePolicy\(policyId!, companyId\)/, "policy detail read stays company-scoped"],
  [policy, /kind="unit"/, "policy detail drills to assigned units"],
  [policy, /Couldn't load policy details[\s\S]*policyQuery\.refetch\(\)/, "policy detail exposes retryable read failures"],
  [gaps, /getInsuranceCoverageGaps\(companyId\)/, "coverage gaps read stays company-scoped"],
  [gaps, /kind="unit"/, "coverage gaps drill to affected units"],
  [gaps, /if \(failedQuery\)[\s\S]*coverageGapsQuery\.refetch\(\)[\s\S]*policiesQuery\.refetch\(\)/, "coverage gaps stop false-zero rendering and retry both reads"],
  [vendor, /vendor_id: vendorId/, "vendor reverse read uses the vendor FK"],
  [vendor, /policies\/\$\{policy\.id\}/, "vendor rows drill to policy detail"],
  [vendor, /Couldn't load this vendor's insurance policies[\s\S]*query\.refetch\(\)/, "vendor reverse exposes retryable read failures"],
  [unit, /kind="insurance_policy"[\s\S]*id=\{policy\.policy_id\}/, "unit profile drills through the policy FK"],
];

for (const [source, pattern, label] of assertions) {
  if (!pattern.test(source)) {
    console.error(`verify-insurance-policy-reverse-leaves: FAIL — ${label}`);
    process.exit(1);
  }
}

console.log(`verify-insurance-policy-reverse-leaves: PASS — ${assertions.length} policy reverse-link invariants`);
