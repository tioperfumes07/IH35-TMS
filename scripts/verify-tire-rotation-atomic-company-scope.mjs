#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/tires.routes.ts", "utf8");
const block = source.match(/app\.post\("\/api\/v1\/maintenance\/tires\/rotate"[\s\S]*?app\.post\("\/api\/v1\/maintenance\/tires\/replace"/)?.[0] ?? "";
const checks = [
  ["source update captured", /const movedSource = await client\.query/],
  ["occupant update captured", /const movedOccupant = await client\.query/],
  ["both updates company scoped", (text) => (text.match(/AND operating_company_id = \$4::uuid/g) ?? []).length === 2],
  ["both updates active only", (text) => (text.match(/AND status = 'active'/g) ?? []).length >= 2],
  ["both updates return identity", (text) => (text.match(/RETURNING id/g) ?? []).length >= 2],
  ["source fails loud", /movedSource[\s\S]{0,100}tire_rotation_source_update_failed/],
  ["occupant fails loud", /movedOccupant[\s\S]{0,100}tire_rotation_occupant_update_failed/],
];
function failures(text) { return checks.flatMap(([label, test]) => (test instanceof RegExp ? test.test(text) : test(text)) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-tire-rotation-atomic-company-scope FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const movedSource = await client.query", "await client.query"],
    ["const movedOccupant = await client.query", "await client.query"],
    ["AND operating_company_id = $4::uuid", "AND TRUE"],
    ["AND status = 'active'", ""],
    ["throw new Error(\"tire_rotation_source_update_failed\")", "return"],
    ["throw new Error(\"tire_rotation_occupant_update_failed\")", "return"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-tire-rotation-atomic-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-tire-rotation-atomic-company-scope PASS — both tire moves are company-scoped mandatory writes");
