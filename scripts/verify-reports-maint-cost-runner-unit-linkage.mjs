#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity","reverse_link"],"leafRe":"^runner\\.maint_cost_unit$","task":"LV-REPORTS-MAINT-COST-RUNNER-UNIT-ID-MISSING"} */
import fs from "node:fs";

const LABEL = "verify-reports-maint-cost-runner-unit-linkage";
const ROUTE_PATH = "apps/backend/src/reports/maintenance-cost-per-unit.routes.ts";
const CONFIG_PATH = "apps/frontend/src/pages/reports/runners/runner-config.ts";

const sources = {
  route: fs.readFileSync(ROUTE_PATH, "utf8"),
  config: fs.readFileSync(CONFIG_PATH, "utf8"),
};

function reportBlock(source) {
  const start = source.indexOf('  "maint-cost-unit": {');
  if (start < 0) return "";
  const end = source.indexOf('\n  "', start + 4);
  return source.slice(start, end < 0 ? source.length : end);
}

export function failures(input = sources) {
  const problems = [];
  if (!/toMaintenanceCostRunnerRow[\s\S]{0,260}unit_id:\s*truck\.unit_id/.test(input.route)) {
    problems.push("runner projection must preserve canonical unit_id");
  }
  if (!/JOIN mdata\.units u[\s\S]{0,180}COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/.test(input.route)) {
    problems.push("unit label/id join must remain scoped to the selected operating company");
  }
  const block = reportBlock(input.config);
  if (!/key:\s*"unit_number"[\s\S]{0,180}entityKind:\s*"unit"[\s\S]{0,100}entityIdKey:\s*"unit_id"/.test(block)) {
    problems.push("maint-cost runner must bind the human unit label to canonical unit_id");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["projection", "route", /unit_id:\s*truck\.unit_id/, "unit_id: undefined"],
    ["company-scope", "route", /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/, "TRUE"],
    ["entity-id-binding", "config", /entityIdKey:\s*"unit_id"/, 'entityIdKey: "unit_number"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const original = key === "config" ? reportBlock(sources.config) : sources[key];
    const mutated = original.replace(pattern, replacement);
    const changed = {
      ...sources,
      [key]: key === "config" ? sources.config.replace(original, mutated) : mutated,
    };
    if (changed[key] === sources[key] || failures(changed).length === 0) {
      throw new Error(`${LABEL} SELFTEST FAIL — planted ${name} defect escaped`);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const problems = failures();
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — scoped maintenance runner rows preserve canonical unit drill-through`);
