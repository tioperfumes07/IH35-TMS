#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.insurance_summary"],"task":"FLEET-F5913-INSURANCE-SUMMARY-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.insurance_summary"],"task":"FLEET-F5940-INSURANCE-SUMMARY-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
// P19-MODULE-12-INSURANCE-VEHICLE-PROFILE-REVERSE-LINK (verify-step reserved separately).
//
// ROOT CAUSE this closes: VehicleProfilePage's "Insurance summary" card was built ENTIRELY from
// mdata.units.us_insurance_policy_number / mx_insurance_policy_number — legacy free-text columns
// nothing auto-populates when a policy is attached through the real Insurance module
// (insurance.policy_unit, the canonical FK: mdata.assets.unit_id -> policy_unit.asset_id ->
// insurance.policy). Live USMCA unit T120 has an active, real, FK-linked auto_liability policy
// (insurer "CC3 Verify Vendor", $1,200/mo... policy SAMPLE-REPROVE-5094-VENDOR-0809) and the legacy
// text fields are all NULL — the card rendered "No US or MX policy on file for this unit", a false
// negative on a genuinely covered asset.
//
// FIX: apps/backend/src/mdata/unit-aggregate.service.ts now also queries insurance.policy_unit
// joined on mdata.assets.unit_id (the real FK, not a unit_code+policy_number text match) and returns
// it as insurance_summary.linked_policies; apps/frontend/.../InsuranceSummarySection.tsx renders
// each as its own card (labelled by coverage_type — insurance.policy has no US/MX jurisdiction
// column, so this does not invent a US/MX slot for a linked policy) and the "no policy" empty state
// only shows when nothing is found in EITHER the legacy fields or the real link.
//
// Static source assertion — no DB needed.
import fs from "node:fs";

const BACKEND_FILE = "apps/backend/src/mdata/unit-aggregate.service.ts";
const FRONTEND_FILE = "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx";
const REQUIRED_FILE = "docs/specs/scoreboard/modules/fleet.required.json";
const FEED_FILE = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF_FILE = "scripts/verify-unit-insurance-linked-policies.mjs";
const EXACT_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.insurance_summary"],"task":"FLEET-F5913-INSURANCE-SUMMARY-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.insurance_summary"],"task":"FLEET-F5940-INSURANCE-SUMMARY-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

function fail(msg) {
  console.error(`FAIL verify-unit-insurance-linked-policies: ${msg}`);
  process.exitCode = 1;
}

function checkBackend(src) {
  if (!src.includes("lookupLinkedPolicies(")) {
    fail(`${BACKEND_FILE}: lookupLinkedPolicies() not found — the real-FK query was removed.`);
    return;
  }
  const fnIdx = src.indexOf("async function lookupLinkedPolicies(");
  if (fnIdx === -1) {
    fail(`${BACKEND_FILE}: lookupLinkedPolicies() definition not found.`);
    return;
  }
  const fnBody = src.slice(fnIdx, fnIdx + 1800);
  if (!/JOIN insurance\.policy_unit\s+pu\s+ON pu\.asset_id = a\.id/.test(fnBody)) {
    fail(`${BACKEND_FILE}: lookupLinkedPolicies() no longer joins insurance.policy_unit on asset_id.`);
  }
  if (!/a\.unit_id = \$2::uuid/.test(fnBody)) {
    fail(`${BACKEND_FILE}: lookupLinkedPolicies() no longer filters on the real a.unit_id FK — the whole point of this fix is NOT gating on the legacy text-match helper.`);
  }
  if (!src.includes("linked_policies: linkedPolicies.map(")) {
    if (!src.includes("linked_policies: linkedPolicyRead.policies.map(")) fail(`${BACKEND_FILE}: insurance_summary no longer includes linked_policies.`);
  }
  if (!src.includes("linked_policies_unavailable: linkedPolicyRead.unavailable")) {
    fail(`${BACKEND_FILE}: linked-policy SQL failure no longer remains distinct from an empty relationship.`);
  }
}

function checkFrontend(src) {
  if (!src.includes("linked_policies?:")) {
    fail(`${FRONTEND_FILE}: UnitInsuranceSummary type no longer declares linked_policies.`);
  }
  if (!/linked\.map\(/.test(src)) {
    fail(`${FRONTEND_FILE}: no longer renders linked_policies as cards.`);
  }
  if (!/!us && !mx && linked\.length === 0/.test(src)) {
    fail(`${FRONTEND_FILE}: empty-state condition no longer accounts for linked_policies — a unit with only a real linked policy (no legacy text fields) would show the false "No US or MX policy" message again.`);
  }
  if (!src.includes("linked_policies_unavailable?: boolean") || !src.includes("Linked insurance policies could not be loaded.") || !/linkedUnavailable \? \(/.test(src)) {
    fail(`${FRONTEND_FILE}: linked-policy read failure must render visibly before the legitimate empty state.`);
  }
  if (!/policy_id:\s*string/.test(src) || !/<EntityLinkOrTombstone kind="insurance_policy" id=\{policy\.policy_id\}/.test(src)) {
    fail(`${FRONTEND_FILE}: linked policies must drill by canonical policy_id.`);
  }
  if (!/<EntityLink[\s\S]{0,100}kind="insurance_coverage_gaps"[\s\S]{0,100}id=\{unitId\}/.test(src)) {
    fail(`${FRONTEND_FILE}: insurance summary must drill to unit-scoped coverage gaps.`);
  }
}

function evidenceFailures({ required, feed, self }) {
  const failures = [];
  let found;
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.id === "unit.profile.insurance_summary" && Array.isArray(value.required)) found = value;
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(required));
  if (!found) failures.push("Fleet insurance summary Required leaf missing");
  else {
    if (!found.required?.includes("reverse_link")) failures.push("Fleet insurance summary must require reverse_link");
    if (!found.required?.includes("connectivity")) failures.push("Fleet insurance summary must require connectivity");
    if (found.route_hint !== "/fleet/units/:id") failures.push("Fleet insurance summary route must be canonical unit profile");
  }
  if (!self.split("// P19-")[0].includes(EXACT_HEADER)) failures.push("exact Fleet insurance summary reverse header missing");
  if (!self.split("// P19-")[0].includes(CONNECTIVITY_HEADER)) failures.push("exact Fleet insurance summary connectivity header missing");
  if (/"guard"\s*:\s*"scripts\/verify-unit-insurance-linked-policies\.mjs"/.test(feed)) failures.push("manual feed duplicates insurance summary ownership");
  return failures;
}

function runChecks() {
  checkBackend(fs.readFileSync(BACKEND_FILE, "utf8"));
  checkFrontend(fs.readFileSync(FRONTEND_FILE, "utf8"));
  for (const failure of evidenceFailures({
    required: fs.readFileSync(REQUIRED_FILE, "utf8"),
    feed: fs.readFileSync(FEED_FILE, "utf8"),
    self: fs.readFileSync(SELF_FILE, "utf8"),
  })) fail(failure);
}

function selftest() {
  const originalBackend = fs.readFileSync(BACKEND_FILE, "utf8");
  const originalFrontend = fs.readFileSync(FRONTEND_FILE, "utf8");
  const originalRequired = fs.readFileSync(REQUIRED_FILE, "utf8");
  const originalFeed = fs.readFileSync(FEED_FILE, "utf8");
  const originalSelf = fs.readFileSync(SELF_FILE, "utf8");
  let probesProven = 0;

  // Mutation 1: drop the real unit_id filter (regress to the class of bug this fixes).
  {
    const mutated = originalBackend.replace("AND a.unit_id = $2::uuid", "AND true");
    if (mutated === originalBackend) {
      console.error("SELFTEST SETUP FAILED: a.unit_id filter pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(BACKEND_FILE, mutated);
    let caught = false;
    try {
      checkBackend(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(BACKEND_FILE, originalBackend);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping the real unit_id filter was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  for (const [name, mutated] of [
    ["policy-drill", originalFrontend.replace('kind="insurance_policy"', 'kind="unit"')],
    ["coverage-gap-drill", originalFrontend.replace('id={unitId}', 'id={policy.policy_id}')],
    ["failure-copy", originalFrontend.replace("Linked insurance policies could not be loaded.", "No policy." )],
    ["failure-branch", originalFrontend.replace("linkedUnavailable ? (", "false ? (")],
  ]) {
    let caught = false;
    try {
      checkFrontend(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
    }
    if (mutated === originalFrontend || !caught) {
      console.error(`SELFTEST INERT: ${name} mutation was not caught.`);
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  {
    const mutated = originalBackend.replace("linked_policies_unavailable: linkedPolicyRead.unavailable", "linked_policies_unavailable: false");
    let caught = false;
    try {
      checkBackend(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
    }
    if (mutated === originalBackend || !caught) {
      console.error("SELFTEST INERT: linked-policy failure marker mutation was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  const evidenceMutations = [
    ["leaf", originalRequired.replace('"unit.profile.insurance_summary"', '"unit.profile.insurance_summary_MISSING"'), originalFeed, originalSelf],
    ["reverse", originalRequired.replace(/("id": "unit\.profile\.insurance_summary"[\s\S]{0,260})"reverse_link"/, '$1"reverse_link_MISSING"'), originalFeed, originalSelf],
    ["route", originalRequired.replace(/("id": "unit\.profile\.insurance_summary"[\s\S]{0,180})"\/fleet\/units\/:id"/, '$1"/fleet/trailers/:id"'), originalFeed, originalSelf],
    ["header", originalRequired, originalFeed, originalSelf.replace(EXACT_HEADER, EXACT_HEADER.replace("reverse_link", "connectivity"))],
    ["connectivity", originalRequired.replace(/("id": "unit\.profile\.insurance_summary"[\s\S]{0,260})"connectivity"/, '$1"connectivity_MISSING"'), originalFeed, originalSelf],
    ["connectivity-header", originalRequired, originalFeed, originalSelf.replace(CONNECTIVITY_HEADER, CONNECTIVITY_HEADER.replace("connectivity", "unit"))],
    ["feed", originalRequired, `[{"guard":"scripts/verify-unit-insurance-linked-policies.mjs"}]`, originalSelf],
  ];
  for (const [name, required, feed, self] of evidenceMutations) {
    if (evidenceFailures({ required, feed, self }).length === 0) {
      console.error(`SELFTEST INERT: ${name} evidence mutation was not caught.`);
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: revert the FE empty-state condition to the old (wrong) one.
  {
    const mutated = originalFrontend.replace("!us && !mx && linked.length === 0", "!us && !mx");
    if (mutated === originalFrontend) {
      console.error("SELFTEST SETUP FAILED: empty-state condition pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(FRONTEND_FILE, mutated);
    let caught = false;
    try {
      checkFrontend(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(FRONTEND_FILE, originalFrontend);
    }
    if (!caught) {
      console.error("SELFTEST INERT: reverting the empty-state condition was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-unit-insurance-linked-policies --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  runChecks();
  if (process.exitCode !== 1) {
    console.log("PASS verify-unit-insurance-linked-policies");
  }
}
