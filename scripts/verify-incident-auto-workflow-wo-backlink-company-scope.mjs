#!/usr/bin/env node

import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/safety/incidents/auto-workflow-trigger.ts", "utf8");
const block = source.match(/if \(maintenanceWorkOrderId\)[\s\S]{0,650}?\n    }/)?.[0] ?? "";
const checks = [
  ["canonical reverse column", /SET work_order_id = \$1::uuid/],
  ["incident identity", /WHERE id = \$2::uuid/],
  ["company identity", /AND operating_company_id = \$3::uuid/],
  ["idempotent empty backlink", /AND work_order_id IS NULL/],
  ["company value bound", /maintenanceWorkOrderId,\s*input\.incident_id,\s*input\.operating_company_id,/],
];
function failures(text) {
  return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]);
}
const problems = failures(block);
if (problems.length) {
  console.error(`verify-incident-auto-workflow-wo-backlink-company-scope FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["SET work_order_id = $1::uuid", "SET work_order_id = NULL"],
    ["WHERE id = $2::uuid", "WHERE TRUE"],
    ["AND operating_company_id = $3::uuid", "AND TRUE"],
    ["AND work_order_id IS NULL", ""],
    ["          input.operating_company_id,", ""],
  ];
  for (const [from, to] of mutations) {
    const changed = block.replace(from, to);
    if (changed === block || failures(changed).length === 0) {
      console.error(`selftest mutation escaped or missing: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-incident-auto-workflow-wo-backlink-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}
console.log("verify-incident-auto-workflow-wo-backlink-company-scope PASS — incident→WO reverse mutation binds incident and operating company");
