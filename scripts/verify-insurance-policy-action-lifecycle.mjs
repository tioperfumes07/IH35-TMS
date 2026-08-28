#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["unit","connectivity","reverse_link"],"leaves":["policies.detail"],"task":"INSURANCE-F6625-POLICY-ACTION-LIFECYCLE","vertical":"column-wave"} */
/** @matrix-built {"modules":["insurance"],"cols":["policy"],"leaves":["policies.list","policies.create","policies.detail"],"task":"INS-F7060-POLICY-IDENTITY-VERTICAL","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/insurance/PolicyDetail.tsx";
const source = [
  fs.readFileSync(FILE, "utf8"),
  fs.readFileSync("apps/frontend/src/pages/insurance/PoliciesList.tsx", "utf8"),
  fs.readFileSync("apps/frontend/src/components/insurance/PolicyCreateModal.tsx", "utf8"),
  fs.readFileSync("apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", "utf8"),
].join("\n/* POLICY_IDENTITY_SURFACE */\n");

function inspect(value) {
  const failures = [];
  const checks = [
    [/kind="insurance_policy" id=\{p\.id\} label=\{entityLabel\(p\.policy_number, p\.id, "Policy"\)\}/, "policy list canonical self drill is missing"],
    [/getInsurancePolicy\(policyId!, companyId\)/, "policy detail exact company/id read is missing"],
    [/title=\{`Policy \$\{entityLabel\(policy\.policy_number, policy\.id, "Policy"\)\}`\}/, "policy detail human identity is missing"],
    [/onCreated\(created\?\.id, created\?\.policy_number \?\? form\.policy_number\.trim\(\)\)/, "policy modal does not return persisted id and label"],
    [/onCreated\(result\.policyId\)/, "policy wizard does not return persisted policy id"],
    [/invalidateQueries\(\{ queryKey: \["insurance", "policies", companyId\] \}\)/g, "policy create does not refresh the exact company list"],
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
    'kind="insurance_policy" id={p.id}',
    "getInsurancePolicy(policyId!, companyId)",
    'title={`Policy ${entityLabel(policy.policy_number, policy.id, "Policy")}`}',
    "onCreated(created?.id, created?.policy_number ?? form.policy_number.trim())",
    "onCreated(result.policyId)",
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
  console.log(`verify-insurance-policy-action-lifecycle selftest PASS — ${mutations.length}/${mutations.length} policy identity/lifecycle defects red`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-insurance-policy-action-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-insurance-policy-action-lifecycle PASS — policy identity create→list→detail and actions are company-record stable");
