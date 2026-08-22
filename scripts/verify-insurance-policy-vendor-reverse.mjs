#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["vendor","connectivity","reverse_link","picker_law"],"leaves":["policies.create","policies.list","insurance.modal.policy_create","insurance.parity.policy_create"],"task":"INSURANCE-POLICY-VENDOR-REVERSE","vertical":"column-wave"} */ /** @matrix-built {"modules":["vendors"],"cols":["vendor","connectivity","reverse_link"],"leaves":["detail.profile"],"task":"INSURANCE-POLICY-VENDOR-REVERSE-PROFILE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-insurance-policy-vendor-reverse";
const files = {
  guard: "scripts/verify-insurance-policy-vendor-reverse.mjs",
  creator: "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  route: "apps/backend/src/insurance/policy.routes.ts",
  api: "apps/frontend/src/api/insurance.ts",
  list: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  reverse: "apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["insurance Built claim names exact applicable leaves", "guard", /@matrix-built \{"modules":\["insurance"\],"cols":\["vendor","connectivity","reverse_link","picker_law"\],"leaves":\["policies\.create","policies\.list","insurance\.modal\.policy_create","insurance\.parity\.policy_create"\]/],
  ["vendor profile Built claim names exact applicable leaf", "guard", /@matrix-built \{"modules":\["vendors"\],"cols":\["vendor","connectivity","reverse_link"\],"leaves":\["detail\.profile"\]/],
  ["creator reloads canonical vendor selection", "creator", /value=\{form\.insurer_vendor_id \|\| null\}/],
  ["creator writes selection into policy form", "creator", /onChange=\{\(next, option\) => \{[\s\S]{0,160}insurer_vendor_id: id,[\s\S]{0,120}insurer_name: option\?\.label/],
  ["creator submits the same canonical vendor FK", "creator", /vendor_id: next\.payload\.insurer_vendor_id/],
  ["writer requires canonical vendor UUID", "route", /const createPolicySchema = z\.object\(\{[\s\S]{0,120}vendor_id: z\.string\(\)\.uuid\(\)/],
  ["writer validates vendor in selected company", "route", /FROM mdata\.vendors[\s\S]{0,180}id = \$1::uuid[\s\S]{0,180}operating_company_id = \$2::uuid/],
  ["writer persists vendor_id on canonical policy", "route", /INSERT INTO insurance\.policy[\s\S]{0,220}vendor_id/],
  ["list schema accepts optional canonical vendor UUID", "route", /listPoliciesQuerySchema[\s\S]{0,300}vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/],
  ["list binds text-safe vendor predicate", "route", /values\.push\(parsed\.data\.vendor_id\)[\s\S]{0,400}filters\.push\(`p\.vendor_id = \$\$\{values\.length\}::text`\)/],
  ["policy response returns canonical vendor FK", "route", /p\.vendor_id::text AS vendor_id|vendor_id::text/],
  ["API row types vendor FK", "api", /export type InsurancePolicy = \{[\s\S]{0,80}vendor_id: string/],
  ["API list accepts vendor filter", "api", /export function listInsurancePolicies\([\s\S]{0,220}vendor_id\?: string/],
  ["policy list forwards active vendor filter", "list", /listInsurancePolicies\(\{[\s\S]{0,400}vendor_id: vendorId/],
  ["reverse cache identity binds company and vendor", "reverse", /queryKey: \["insurance", "reverse", "vendor-policies", operatingCompanyId, vendorId\]/],
  ["reverse GET binds company and vendor", "reverse", /listInsurancePolicies\(\{ operating_company_id: operatingCompanyId, vendor_id: vendorId \}\)/],
  ["reverse query waits for both identities", "reverse", /enabled: Boolean\(operatingCompanyId && vendorId\)/],
  ["reverse preserves retryable failure", "reverse", /query\.isError[\s\S]{0,420}query\.refetch\(\)/],
  ["reverse preserves honest empty state", "reverse", /No active insurance policies are linked to this vendor/],
  ["reverse opens exact vendor-filtered policy list", "reverse", /kind="insurance_policies_vendor" id=\{vendorId\}/],
  ["each returned policy drills by exact ID and human number", "reverse", /rows\.map\(\(policy\) => <li key=\{policy\.id\}[\s\S]{0,180}<EntityLink kind="insurance_policy" id=\{policy\.id\} label=\{policy\.policy_number\}/],
  ["vendor profile mounts selected company and exact vendor", "vendor", /<VendorInsurancePoliciesReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\} \/>/],
];

function audit(sources) {
  return checks.filter(([, key, pattern]) => !pattern.test(sources[key])).map(([message]) => message);
}

if (process.argv.includes("--selftest")) {
  const baseline = audit(source);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — baseline: ${baseline.join("; ")}`);
    process.exit(1);
  }
  for (const [message, key, pattern] of checks) {
    const changedSource = source[key].replace(pattern, "/* planted insurance vendor reverse defect */");
    if (changedSource === source[key]) {
      console.error(`${LABEL} SELFTEST FAIL — inert plant: ${message}`);
      process.exit(1);
    }
    if (!audit({ ...source, [key]: changedSource }).includes(message)) {
      console.error(`${LABEL} SELFTEST FAIL — escaped plant: ${message}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} production-source defects caught`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — vendor picker→same-company policy FK→filtered reverse→exact policy drill`);
