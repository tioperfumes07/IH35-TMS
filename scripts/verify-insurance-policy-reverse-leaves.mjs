#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link"],"leaves":["policies.detail","coverage_gaps"],"task":"INS-F5895-POLICY-REVERSE-EXACT","vertical":"class-sweep"} */

import fs from "node:fs";

const files = {
  policy: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  gaps: "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
  vendor: "apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx",
  unit: "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx",
  matrix: "docs/specs/scoreboard/modules/insurance.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-insurance-policy-reverse-leaves.mjs",
};
const HEADER = '/** @matrix-built {"modules":["insurance"],"cols":["reverse_link"],"leaves":["policies.detail","coverage_gaps"],"task":"INS-F5895-POLICY-REVERSE-EXACT","vertical":"class-sweep"} */';
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
  const failures = checks
    .filter(([, key, pattern]) => !pattern.test(sources[key]))
    .map(([name]) => name);
  let matrix;
  try { matrix = JSON.parse(sources.matrix); } catch (error) { failures.push(`Insurance matrix parse: ${error.message}`); }
  for (const [id, route] of [["policies.detail", "/safety/insurance/policies/:id"], ["coverage_gaps", "/safety/insurance/coverage-gaps"]]) {
    const leaf = matrix?.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("reverse_link")) failures.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  if (!sources.self.split('import fs from "node:fs";')[0].includes(HEADER)) failures.push("exact two-leaf header missing");
  try { if (JSON.parse(sources.feed).entries?.some((entry) => entry.guard === files.self)) failures.push("manual feed duplicates exact ownership"); }
  catch (error) { failures.push(`feed parse: ${error.message}`); }
  return failures;
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
  for (const [id, route] of [["policies.detail", "/safety/insurance/policies/:id"], ["coverage_gaps", "/safety/insurance/coverage-gaps"]]) {
    const idToken = `"id": "${id}"`, start = original.matrix.indexOf(idToken), end = original.matrix.indexOf("\n    {", start + idToken.length), block = original.matrix.slice(start, end < 0 ? original.matrix.length : end);
    for (const [token, replacement] of [[idToken, `"id": "${id}.broken"`], ['"reverse_link"', '"reverse_link_broken"'], [`"route_hint": "${route}"`, '"route_hint": "broken"']]) {
      const changed = original.matrix.slice(0, start) + block.replace(token, replacement) + original.matrix.slice(end < 0 ? original.matrix.length : end);
      if (!audit({ ...original, matrix: changed }).length) throw new Error(`matrix mutation survived: ${id} ${token}`);
    }
  }
  const broken = HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"');
  if (!audit({ ...original, self: original.self.replace(HEADER, broken) }).length) throw new Error("header mutation survived");
  const feed = JSON.parse(original.feed); feed.entries.unshift({ guard: files.self, modules: ["insurance"], cols: ["reverse_link"], leafRe: ".*" });
  if (!audit({ ...original, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log("verify-insurance-policy-reverse-leaves SELFTEST PASS — 18/18 runtime/evidence mutations detected");
  process.exit(0);
}

console.log(`verify-insurance-policy-reverse-leaves: PASS — ${checks.length} policy reverse-link invariants`);
