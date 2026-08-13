#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-insurance-policy-unit-double-route";
const files = {
  policyRoute: "apps/backend/src/insurance/policy.routes.ts",
  aggregate: "apps/backend/src/mdata/unit-aggregate.service.ts",
  api: "apps/frontend/src/api/insurance.ts",
  policy: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  unit: "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/COALESCE\(a\.unit_id::text, u\.id::text\) AS unit_id,[\s\S]{0,40}u\.unit_number/.test(s.policyRoute)) failures.push("policy payload must resolve unit id and number");
  if (!/u\.id = a\.unit_id OR \(a\.unit_id IS NULL AND u\.unit_number = a\.unit_code\)/.test(s.policyRoute)) failures.push("policy unit resolution must prefer canonical asset.unit_id FK");
  if (!/policy_id:\s*p\.policy_id/.test(s.aggregate) || !/p\.id::text AS policy_id/.test(s.aggregate)) failures.push("unit aggregate must retain linked policy FK");
  if (!/unit_number\?: string \| null/.test(s.api)) failures.push("policy unit client type must expose resolved number");
  if (!/kind="unit"[\s\S]{0,120}entityLabel\(unit\.unit_number/.test(s.policy)) failures.push("policy detail must render resolved canonical unit drill");
  if (!/kind="insurance_policy"[\s\S]{0,120}policy\.policy_id/.test(s.unit)) failures.push("unit summary must render canonical policy drill");
  if (!/case "unit":[\s\S]{0,60}`\/fleet\/units\/\$\{id\}`/.test(s.link)) failures.push("unit route must be canonical");
  if (!/case "insurance_policy":[\s\S]{0,80}`\/safety\/insurance\/policies\/\$\{id\}`/.test(s.link)) failures.push("policy route must be canonical");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["unit label", "policyRoute", /u\.unit_number,/, "NULL::text AS unit_number,"],
    ["canonical unit join", "policyRoute", /u\.id = a\.unit_id OR \(a\.unit_id IS NULL AND u\.unit_number = a\.unit_code\)/, "u.unit_number = a.unit_code"],
    ["policy select", "aggregate", /p\.id::text AS policy_id,/, ""],
    ["policy payload", "aggregate", /policy_id:\s*p\.policy_id,/, ""],
    ["client type", "api", /unit_number\?: string \| null;/, ""],
    ["unit drill", "policy", /kind="unit"/, 'kind="driver"'],
    ["unit label use", "policy", /entityLabel\(unit\.unit_number/, "entityLabel(null"],
    ["policy drill", "unit", /kind="insurance_policy"/, 'kind="claim"'],
    ["unit route", "link", /case "unit":/, 'case "unit_missing":'],
    ["policy route", "link", /case "insurance_policy":/, 'case "policy_missing":'],
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
console.log(`${LABEL} PASS — policy→resolved unit drill and unit→linked policy drill are both canonical`);
