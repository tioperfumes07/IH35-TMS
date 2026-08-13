#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-insurance-coi-policy-reverse";
const files = {
  schema: "apps/backend/src/insurance/coi.shared.ts",
  service: "apps/backend/src/insurance/coi.service.ts",
  api: "apps/frontend/src/api/insurance.ts",
  creator: "apps/frontend/src/pages/customers/CoiTab.tsx",
  policy: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

function audit(s) {
  const failures = [];
  if ((s.creator.match(/kind="insurance_policy"/g) ?? []).length < 2) failures.push("both creator variants must use canonical policy picker");
  if (!/customer_id:\s*customerId/.test(s.creator) || !/policy_id:\s*requestPolicyId/.test(s.creator)) failures.push("creator must forward customer and policy FKs");
  if (!/policy_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.schema)) failures.push("list schema must accept policy reverse filter");
  if (!/clauses\.push\(`r\.policy_id = \$\$\{values\.length\}::uuid`\)/.test(s.service)) failures.push("service must apply exact policy predicate");
  if (!/c\.operating_company_id = r\.tenant_id/.test(s.service) || !/c\.legal_name AS customer_name/.test(s.service)) failures.push("reverse payload must resolve tenant-matched customer label");
  if (!/export const insuranceCoiApi[\s\S]{0,220}policy_id\?: string;[\s\S]{0,180}coi-requests/.test(s.api)) failures.push("client must expose policy filter");
  if (!/function listInsuranceCoiRequests[\s\S]{0,140}policy_id\?: string;/.test(s.api)) failures.push("public client wrapper must forward policy filter type");
  if (!/listInsuranceCoiRequests\(\{ operating_company_id: companyId, policy_id: policyId \}\)/.test(s.policy)) failures.push("policy detail must request exact reverse filter");
  if (/\.filter\(\(row\) => row\.policy_id === policyId\)/.test(s.policy)) failures.push("policy reverse must not filter a company-wide response in browser");
  if (!/Couldn't load this policy's COI history/.test(s.policy) || !/ListErrorState/.test(s.policy)) failures.push("policy reverse must expose read errors honestly");
  if (!/kind="customer"[\s\S]{0,100}customer_name/.test(s.policy)) failures.push("reverse rows must drill to canonical customer");
  if (!/case "customer":[\s\S]{0,60}`\/customers\/\$\{id\}`/.test(s.link)) failures.push("customer drill must resolve to canonical detail route");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind="insurance_policy"/g, 'kind="driver"'],
    ["customer payload", "creator", /customer_id:\s*customerId/g, "customer_id: undefined"],
    ["policy payload", "creator", /policy_id:\s*requestPolicyId/g, "policy_id: null"],
    ["schema", "schema", /policy_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, ""],
    ["server filter", "service", /r\.policy_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["tenant join", "service", /c\.operating_company_id = r\.tenant_id/, "TRUE"],
    ["label", "service", /c\.legal_name AS customer_name/, "NULL AS customer_name"],
    ["api", "api", /(export const insuranceCoiApi[\s\S]{0,220})policy_id\?: string;/, "$1"],
    ["api wrapper", "api", /(function listInsuranceCoiRequests[\s\S]{0,140})policy_id\?: string;/, "$1"],
    ["exact read", "policy", /listInsuranceCoiRequests\(\{ operating_company_id: companyId, policy_id: policyId \}\)/, "listInsuranceCoiRequests({ operating_company_id: companyId })"],
    ["honest error", "policy", /Couldn't load this policy's COI history/, "COI history unavailable"],
    ["customer link", "policy", /kind="customer"/, 'kind="vendor"'],
    ["canonical route", "link", /case "customer":/, 'case "customer_missing":'],
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
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — COI customer/policy create→tenant-resolved exact policy reverse→customer drill`);
