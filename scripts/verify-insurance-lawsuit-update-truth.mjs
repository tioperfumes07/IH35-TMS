#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/lawsuit.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf('/api/v1/insurance/lawsuits/:id"'));
  const checks = [
    ["mutation limiter", /lawsuits\/:id"[\s\S]{0,180}rateLimit:\s*\{\s*max:\s*120,\s*timeWindow:\s*"1 minute"/],
    ["status lock", /SELECT status[\s\S]{0,180}FROM insurance\.lawsuit[\s\S]{0,180}tenant_id = \$1::uuid AND id = \$2::uuid[\s\S]{0,100}LIMIT 1[\s\S]{0,40}FOR UPDATE/],
    ["company update", /UPDATE insurance\.lawsuit[\s\S]{0,180}WHERE tenant_id = \$1::uuid AND id = \$2::uuid[\s\S]{0,100}RETURNING/],
    ["create proven row", /if \(!result\.rows\[0\]\) return \{ kind: "lawsuit_not_found" as const \}[\s\S]{0,100}const lawsuit = result\.rows\[0\]/],
    ["update audit", /appendCrudAudit\([\s\S]{0,120}"insurance\.lawsuit\.updated"[\s\S]{0,180}resource_type: "insurance\.lawsuit"[\s\S]{0,100}resource_id: lawsuit\.id/],
    ["company and linkage audit", /operating_company_id: query\.data\.operating_company_id[\s\S]{0,100}claim_id: body\.claim_id[\s\S]{0,100}status: body\.status/],
    ["proven response", /row: lawsuit/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-lawsuit-update-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['{ config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },', ""],
    ["            FOR UPDATE\n", ""],
    ['"insurance.lawsuit.updated"', '"insurance.lawsuit.missing"'],
    ["resource_id: lawsuit.id,\n        operating_company_id: query.data.operating_company_id", 'resource_id: "",\n        operating_company_id: query.data.operating_company_id'],
    ["status: body.status", 'status: ""'],
    ["row: lawsuit", "row: result.rows[0]"],
  ];
  for (const [from, to] of mutations) {
    const index = from === "row: lawsuit" ? source.lastIndexOf(from) : source.indexOf(from);
    const changed = index < 0 ? source : `${source.slice(0, index)}${to}${source.slice(index + from.length)}`;
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-lawsuit-update-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-lawsuit-update-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-lawsuit-update-truth PASS — lawsuit status transition is locked and every update is audited");
