#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/tires.routes.ts", "utf8");
const block = source.match(/app\.post\("\/api\/v1\/maintenance\/tires\/tread-audit"[\s\S]*?app\.get\("\/api\/v1\/maintenance\/tires\/alerts"/)?.[0] ?? "";
const checks = [
  ["update captured", /const updatedTread = await client\.query/],
  ["company predicate", /operating_company_id = \$3::uuid/],
  ["active compare-and-swap", /AND status = 'active'/],
  ["identity returned", /RETURNING id/],
  ["exact row required", /updatedTread\.rows\.length !== 1/],
  ["failure is loud", /throw new Error\("tire_tread_audit_update_failed"\)/],
  ["event follows successful update", (text) => text.indexOf("updatedTread.rows.length") < text.indexOf("INSERT INTO maintenance.tire_events")],
];
function failures(text) { return checks.flatMap(([label, test]) => (test instanceof RegExp ? test.test(text) : test(text)) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-tire-tread-audit-source-cas FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const updatedTread = await client.query", "await client.query"],
    ["operating_company_id = $3::uuid", "TRUE"],
    ["AND status = 'active'", ""],
    ["RETURNING id", ""],
    ["updatedTread.rows.length !== 1", "false"],
    ["throw new Error(\"tire_tread_audit_update_failed\")", "return"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-tire-tread-audit-source-cas --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-tire-tread-audit-source-cas PASS — tread event is recorded only after one active company tire is updated");
