#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["unit","connectivity","reverse_link"],"leaves":["policies.detail"],"task":"INSURANCE-F6625-POLICY-ACTION-LIFECYCLE","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/insurance/PolicyDetail.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/policyActionGenerationRef = useRef\(0\)/, "missing policy action generation"],
    [/pendingArchive, setPendingArchive/, "missing immutable archive snapshot"],
    [/updateInsurancePolicy\(input\.policyId, input\.companyId, input\.payload\)/, "update uses mutable policy/company/form"],
    [/archiveInsurancePolicy\(input\.policyId, input\.companyId\)/, "archive uses mutable policy/company"],
    [/(?:input\.generation !== policyActionGenerationRef\.current|input\.generation === policyActionGenerationRef\.current)/g, "stale callbacks are not gated"],
    [/policyActionGenerationRef\.current \+= 1;[\s\S]*setPendingArchive\(null\);[\s\S]*setEditing\(false\);[\s\S]*updateMutation\.reset\(\);[\s\S]*archiveMutation\.reset\(\);[\s\S]*\}, \[companyId, policyId\]\)/, "policy/company switch leaves stale actions"],
    [/setPendingArchive\(\{ policyId, companyId, generation: policyActionGenerationRef\.current \}\)/, "archive click does not snapshot policy/company/generation"],
    [/<ConfirmModal[\s\S]*title="Archive this policy\?"[\s\S]*await archiveMutation\.mutateAsync\(pendingArchive\)/, "archive lacks awaited confirmation write"],
    [/kind="unit"/, "policy unit reverse drill is missing"],
    [/kind="claim"/, "policy claim reverse drill is missing"],
    [/kind="customer"/, "policy customer reverse drill is missing"],
    [/kind="lawsuit"/, "policy lawsuit reverse drill is missing"],
  ];
  for (const [pattern, message] of checks) {
    const match = value.match(pattern);
    if (!match || (message === "stale callbacks are not gated" && match.length < 4)) failures.push(message);
  }
  if (/window\.confirm\(/.test(value)) failures.push("native archive confirmation remains");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "policyActionGenerationRef = useRef(0)",
    "pendingArchive, setPendingArchive",
    "updateInsurancePolicy(input.policyId, input.companyId, input.payload)",
    "archiveInsurancePolicy(input.policyId, input.companyId)",
    "policyActionGenerationRef.current += 1;",
    "setPendingArchive({ policyId, companyId, generation: policyActionGenerationRef.current })",
    "<ConfirmModal",
    'kind="unit"',
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.replace(token, "REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-insurance-policy-action-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-insurance-policy-action-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-insurance-policy-action-lifecycle PASS — policy update/archive are company-record stable with reverse drills");
