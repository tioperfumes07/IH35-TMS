#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/safety/safety-v5.routes.ts", "utf8");
const block = source.match(/const linkedInspection = await client\.query[\s\S]{0,900}?dot_inspection_work_order_backlink_failed[\s\S]{0,30}/)?.[0] ?? "";
const checks = [
  ["reverse FK mutation", /SET spawned_wo_id = \$2/],
  ["inspection identity", /WHERE id = \$1/],
  ["company identity", /operating_company_id = \$3::uuid/],
  ["idempotent empty link", /spawned_wo_id IS NULL/],
  ["company bind", /inspection\.id, spawnedWo\.woUuid, query\.data\.operating_company_id/],
  ["exactly one row", /\(linkedInspection\.rowCount \?\? linkedInspection\.rows\.length\) !== 1/],
  ["loud failure", /throw new Error\("dot_inspection_work_order_backlink_failed"\)/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-dot-inspection-wo-backlink-company-fail-loud FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["SET spawned_wo_id = $2", "SET spawned_wo_id = NULL"],
    ["WHERE id = $1", "WHERE TRUE"],
    ["AND operating_company_id = $3::uuid", "AND TRUE"],
    ["AND spawned_wo_id IS NULL", ""],
    ["query.data.operating_company_id", "undefined"],
    ["(linkedInspection.rowCount ?? linkedInspection.rows.length) !== 1", "false"],
    ["throw new Error(\"dot_inspection_work_order_backlink_failed\")", "return"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-dot-inspection-wo-backlink-company-fail-loud --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-dot-inspection-wo-backlink-company-fail-loud PASS — DOT inspection→WO reverse FK is company-bound and mandatory");
