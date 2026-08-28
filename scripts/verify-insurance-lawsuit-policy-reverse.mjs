#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["picker_law"],"leafRe":"^(lawsuits\\.create|insurance\\.(modal|parity)\\.lawsuit_create)$","task":"LV-INSURANCE-LAWSUIT-CLAIM-PICKER-NO-INLINE-CREATE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-insurance-lawsuit-policy-reverse";
const files = {
  schema: "apps/backend/src/insurance/claim.shared.ts",
  route: "apps/backend/src/insurance/lawsuit.routes.ts",
  api: "apps/frontend/src/api/insurance.ts",
  creator: "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx",
  claimCreator: "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  picker: "apps/frontend/src/components/parity/EntityPicker.tsx",
  registry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  policy: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/EntityPicker[\s\S]{0,100}kind="insurance_claim"/.test(s.creator) || !/claim_id:\s*form\.claim_id \|\| null/.test(s.creator)) failures.push("creator must pick and submit canonical claim FK");
  if (!/kind="insurance_claim"[\s\S]{0,220}allowCreate[\s\S]{0,220}nestedInDrawer/.test(s.creator)) failures.push("lawsuit creator must offer nested canonical claim creation");
  if (!/insurance_claim:\s*\{[\s\S]{0,420}readTable:\s*"insurance\.claims"[\s\S]{0,180}writeTable:\s*"insurance\.claims"[\s\S]{0,260}inlineCreate:\s*\{\s*available:\s*true/.test(s.registry)) failures.push("claim picker registry must declare same-table inline create");
  if (!/import \{ ClaimCreateModal \}/.test(s.picker) || !/kind === "insurance_claim"[\s\S]{0,260}<ClaimCreateModal[\s\S]{0,260}handleCreated\(id, label\)/.test(s.picker)) failures.push("shared picker must delegate claim creation and auto-select its id/label");
  const claimSuccessBody = s.claimCreator.match(/onSuccess:\s*\(claim,\s*input\)\s*=>\s*\{([\s\S]*?)\n\s*\},\n\s*onError:/)?.[1] ?? "";
  if (!/onCreated\(claim\.id,\s*claim\.claim_number\)/.test(claimSuccessBody)) failures.push("claim creator must return the persisted canonical id and label");
  if (!/listLawsuitsQuerySchema[\s\S]{0,180}policy_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.schema)) failures.push("list schema must accept policy filter");
  if (!/claim\.policy_id = \$\$\{values\.length\}::uuid/.test(s.route)) failures.push("route must apply exact policy predicate through claim");
  if (!/claim\.tenant_id = lawsuit\.tenant_id[\s\S]{0,80}claim\.id = lawsuit\.claim_id/.test(s.route)) failures.push("policy reverse join must retain tenant match");
  if (!/INSERT INTO insurance\.lawsuit \([\s\S]{0,100}tenant_id,\s*operating_company_id,[\s\S]{0,500}VALUES \(\s*\$1::uuid, \$1::uuid,/.test(s.route)) failures.push("lawsuit create must stamp the scoped company into tenant_id and FORCE-RLS operating_company_id");
  if ((s.api.match(/policy_id\?: string;/g) ?? []).length < 7) failures.push("lawsuit API and public wrapper must expose policy filter");
  if (!/listInsuranceLawsuits\(\{ operating_company_id: companyId, policy_id: policyId \}\)/.test(s.policy)) failures.push("policy detail must request exact lawsuit reverse filter");
  if (/\.filter\(\(lawsuit\) => lawsuit\.claim_id/.test(s.policy)) failures.push("policy detail must not browser-filter company-wide lawsuits");
  if (!/Couldn't load this policy's lawsuits/.test(s.policy) || !/lawsuitsQuery\.refetch/.test(s.policy)) failures.push("reverse surface must expose retryable errors");
  if (!/kind="lawsuit"[\s\S]{0,80}row\.id/.test(s.policy)) failures.push("reverse row must drill to canonical lawsuit");
  if (!/case "lawsuit":[\s\S]{0,100}lawsuits\?lawsuit_id=/.test(s.link)) failures.push("lawsuit drill must target highlighted canonical list");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind="insurance_claim"/, 'kind="insurance_policy"'],
    ["payload", "creator", /claim_id:\s*form\.claim_id \|\| null/, "claim_id: null"],
    ["create row", "creator", /\s+allowCreate\n/, "\n"],
    ["nested drawer", "creator", /\s+nestedInDrawer\n/, "\n"],
    ["registry create", "registry", /(insurance_claim:\s*\{[\s\S]{0,900}available:)\s*true/, "$1 false"],
    ["picker delegate", "picker", /kind === "insurance_claim"/, 'kind === "insurance_claim_missing"'],
    ["auto select", "picker", /(kind === "insurance_claim"[\s\S]{0,260})handleCreated\(id, label\)/, "$1setCreateOpen(false)"],
    ["created id", "claimCreator", /onCreated\(claim\.id, claim\.claim_number\)/, "onCreated()"],
    ["schema", "schema", /(listLawsuitsQuerySchema[\s\S]{0,180})policy_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, "$1"],
    ["filter", "route", /claim\.policy_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["tenant", "route", /claim\.tenant_id = lawsuit\.tenant_id/, "TRUE"],
    ["create opco stamp", "route", /tenant_id,\s*operating_company_id,/, "tenant_id,"],
    ["api", "api", /policy_id\?: string;/g, ""],
    ["exact read", "policy", /listInsuranceLawsuits\(\{ operating_company_id: companyId, policy_id: policyId \}\)/, "listInsuranceLawsuits({ operating_company_id: companyId })"],
    ["error", "policy", /Couldn't load this policy's lawsuits/, "Lawsuits unavailable"],
    ["drill", "policy", /kind="lawsuit"/, 'kind="claim"'],
    ["route", "link", /case "lawsuit":/, 'case "lawsuit_missing":'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} linkage mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — lawsuit claim create→tenant-scoped exact policy reverse→highlighted canonical drill`);
