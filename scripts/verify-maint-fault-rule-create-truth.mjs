#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/fault-auto-wo/fault-rules.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const createStart = candidate.indexOf('app.post(\n    "/api/v1/maintenance/fault-rules",');
  const createEnd = candidate.indexOf('app.patch("/api/v1/maintenance/fault-rules/:id"', createStart);
  if (createStart < 0 || createEnd < 0) return ["canonical create route boundary"];
  const route = candidate.slice(createStart, createEnd);
  const checks = [
    ["creator limiter", /rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["canonical insert row", /const created = res\.rows\[0\][\s\S]{0,100}if \(!created\?\.id\) throw new Error\("maintenance_fault_rule_insert_failed"\)/],
    ["company create audit", /appendCrudAudit\([\s\S]{0,120}"maintenance\.fault_rule\.created"[\s\S]{0,220}resource_id: created\.id[\s\S]{0,120}operating_company_id: b\.operating_company_id/],
    ["response uses proven row", /return created;/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-maint-fault-rule-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['app.post(\n    "/api/v1/maintenance/fault-rules",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', 'app.post(\n    "/api/v1/maintenance/fault-rules",\n    { config: { rateLimit: { max: 59, timeWindow: "1 minute" } } },'],
    ['if (!created?.id) throw new Error("maintenance_fault_rule_insert_failed");', ""],
    ['"maintenance.fault_rule.created"', '"maintenance.fault_rule.missing"'],
    ["resource_id: created.id", 'resource_id: ""'],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-maint-fault-rule-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-fault-rule-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-fault-rule-create-truth PASS — create requires and audits a canonical fault rule");
