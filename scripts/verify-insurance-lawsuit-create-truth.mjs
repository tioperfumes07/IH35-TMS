#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/lawsuit.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const routeStart = candidate.indexOf('app.post(\n    "/api/v1/insurance/lawsuits"');
  const nextRoute = routeStart < 0
    ? -1
    : candidate.indexOf('app.patch("/api/v1/insurance/lawsuits/:id"', routeStart);
  const route = routeStart < 0 || nextRoute < 0 ? "" : candidate.slice(routeStart, nextRoute);
  const checks = [
    ["creator limiter", /insurance\/lawsuits"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["insert identity", /const lawsuit = result\.rows\[0\][\s\S]{0,100}if \(!lawsuit\?\.id\) throw new Error\("insurance_lawsuit_insert_failed"\)/],
    ["company create audit", /appendCrudAudit\([\s\S]{0,120}"insurance\.lawsuit\.created"[\s\S]{0,220}resource_id: lawsuit\.id[\s\S]{0,120}operating_company_id: body\.operating_company_id/],
    ["claim linkage audit", /claim_id: body\.claim_id \?\? null/],
    ["proven response row", /row: lawsuit/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-lawsuit-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['"/api/v1/insurance/lawsuits",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', '"/api/v1/insurance/lawsuits",\n    { config: {} },'],
    ['if (!lawsuit?.id) throw new Error("insurance_lawsuit_insert_failed");', ""],
    ['"insurance.lawsuit.created"', '"insurance.lawsuit.missing"'],
    ["resource_id: lawsuit.id", 'resource_id: ""'],
    ["row: lawsuit", "row: result.rows[0]"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-lawsuit-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-lawsuit-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-lawsuit-create-truth PASS — lawsuit create requires and audits a canonical row");
