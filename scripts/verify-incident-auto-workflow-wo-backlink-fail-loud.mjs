#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/safety/incidents/auto-workflow-trigger.ts", "utf8");
const block = source.match(/if \(maintenanceWorkOrderId\)[\s\S]{0,900}?\n    }/)?.[0] ?? "";
const checks = [
  ["capture mutation result", /const backlink = await client\.query/],
  ["exactly one row required", /\(backlink\.rowCount \?\? backlink\.rows\.length\) !== 1/],
  ["failure is loud", /throw new Error\("incident_work_order_backlink_failed"\)/],
  ["company-bound update retained", /operating_company_id = \$3::uuid/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-incident-auto-workflow-wo-backlink-fail-loud FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const backlink = await client.query", "await client.query"],
    ["(backlink.rowCount ?? backlink.rows.length) !== 1", "false"],
    ["throw new Error(\"incident_work_order_backlink_failed\")", "return"],
    ["operating_company_id = $3::uuid", "TRUE"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-incident-auto-workflow-wo-backlink-fail-loud --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-incident-auto-workflow-wo-backlink-fail-loud PASS — spawned WO cannot commit without its incident reverse FK");
