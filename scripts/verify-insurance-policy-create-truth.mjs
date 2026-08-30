#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/policy.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const routeStart = candidate.indexOf('app.post(\n    "/api/v1/insurance/policies"');
  const nextRoute = routeStart < 0
    ? -1
    : candidate.indexOf('app.patch("/api/v1/insurance/policies/:id"', routeStart);
  const route = routeStart < 0 || nextRoute < 0 ? "" : candidate.slice(routeStart, nextRoute);
  const checks = [
    ["creator limiter", /insurance\/policies"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["company vendor", /FROM mdata\.vendors[\s\S]{0,180}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/],
    ["company catalog", /FROM insurance\.type_catalog[\s\S]{0,180}tenant_id = \$1::uuid[\s\S]{0,140}active = true/],
    ["insert identity", /const policy = result\.rows\[0\][\s\S]{0,100}if \(!policy\?\.id\) throw new Error\("insurance_policy_insert_failed"\)/],
    ["create audit", /appendCrudAudit\([\s\S]{0,120}"insurance\.policy\.created"[\s\S]{0,180}resource_type: "insurance\.policy"[\s\S]{0,100}resource_id: policy\.id/],
    ["linkage audit", /operating_company_id: body\.operating_company_id[\s\S]{0,100}vendor_id: body\.vendor_id[\s\S]{0,120}coverage_type_id: coverageTypeRes\.rows\[0\]\.id/],
    ["proven row", /kind: "created" as const, policy\s*\}/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-policy-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['"/api/v1/insurance/policies",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', '"/api/v1/insurance/policies",\n    { config: {} },'],
    ['if (!policy?.id) throw new Error("insurance_policy_insert_failed");', ""],
    ['"insurance.policy.created"', '"insurance.policy.missing"'],
    ['resource_type: "insurance.policy"', 'resource_type: "insurance.missing"'],
    ["resource_id: policy.id", 'resource_id: ""'],
    ["vendor_id: body.vendor_id", 'vendor_id: ""'],
    ['kind: "created" as const, policy', 'kind: "created" as const, policy: result.rows[0]'],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-policy-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-policy-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-policy-create-truth PASS — direct policy create requires and audits a canonical company-linked row");
