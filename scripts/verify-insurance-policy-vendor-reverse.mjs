#!/usr/bin/env node
/** @matrix-built modules=insurance,vendors,safety cols=vendor,connectivity,reverse_link,picker_law */
import fs from "node:fs";
const LABEL = "verify-insurance-policy-vendor-reverse";
const files = {
  creator: "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  route: "apps/backend/src/insurance/policy.routes.ts",
  api: "apps/frontend/src/api/insurance.ts",
  list: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  reverse: "apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/value=\{form\.insurer_vendor_id \|\| null\}/.test(s.creator) || !/vendor_id: next\.payload\.insurer_vendor_id/.test(s.creator)) failures.push("vendor picker-to-policy payload missing");
  if (!/vendor_id: z\.string\(\)\.uuid\(\)/.test(s.route) || !/FROM mdata\.vendors[\s\S]{0,180}operating_company_id = \$2::uuid/.test(s.route) || !/INSERT INTO insurance\.policy[\s\S]{0,160}vendor_id/.test(s.route)) failures.push("writer vendor scope validation missing");
  if (!/listPoliciesQuerySchema[\s\S]{0,220}vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/filters\.push\(`vendor_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("exact vendor list filter missing");
  if (!/vendor_id::text/.test(s.route) || !/vendor_id: string/.test(s.api)) failures.push("policy response vendor FK missing");
  if (!/export function listInsurancePolicies\([\s\S]{0,180}vendor_id\?: string/.test(s.api) || !/vendor_id: vendorId/.test(s.list)) failures.push("frontend filtered list contract missing");
  if (!/listInsurancePolicies\(\{ operating_company_id: operatingCompanyId, vendor_id: vendorId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No active insurance policies are linked to this vendor/.test(s.reverse)) failures.push("honest vendor policy reverse missing");
  if (!/safety\/insurance\/policies\?vendor_id=/.test(s.reverse) || !/safety\/insurance\/policies\/\$\{policy\.id\}/.test(s.reverse)) failures.push("filtered list and policy detail drills missing");
  if (!/VendorInsurancePoliciesReverseSection[\s\S]{0,140}vendorId=\{vendor\.id\}/.test(s.vendor)) failures.push("vendor profile mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /value=\{form\.insurer_vendor_id \|\| null\}/, "value={null}"],
    ["payload", "creator", /vendor_id: next\.payload\.insurer_vendor_id/, "vendor_id: undefined"],
    ["writer", "route", /operating_company_id = \$2::uuid/, "TRUE"],
    ["filter", "route", /filters\.push\(`vendor_id = \$\$\{values\.length\}::uuid`\)/, "void 0"],
    ["select", "route", /vendor_id::text/, "NULL::text AS vendor_id"],
    ["api", "api", /(export function listInsurancePolicies\([\s\S]{0,180})vendor_id\?: string/, "$1wrong_id?: string"],
    ["list", "list", /vendor_id: vendorId/, "vendor_id: undefined"],
    ["reverse", "reverse", /vendor_id: vendorId/, "vendor_id: operatingCompanyId"],
    ["drill", "reverse", /safety\/insurance\/policies\?vendor_id=/, "safety/insurance/policies?wrong_id="],
    ["mount", "vendor", /VendorInsurancePoliciesReverseSection/g, "MissingPolicyReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — vendor picker→scoped policy writer→exact vendor list→vendor profile reverse`);
