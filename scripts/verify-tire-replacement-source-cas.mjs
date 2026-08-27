#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/tires.routes.ts", "utf8");
const block = source.match(/app\.post\("\/api\/v1\/maintenance\/tires\/replace"[\s\S]*?app\.post\("\/api\/v1\/maintenance\/tires\/tread-audit"/)?.[0] ?? "";
const checks = [
  ["archive result captured", /const archivedExisting = await client\.query/],
  ["company predicate", /operating_company_id = \$2::uuid/],
  ["active compare-and-swap", /AND status = 'active'/],
  ["archive identity returned", /AND status = 'active'\s+RETURNING id/],
  ["exact row required", /archivedExisting\.rows\.length !== 1/],
  ["failure is loud", /throw new Error\("tire_replacement_source_archive_failed"\)/],
  ["archive precedes replacement insert", (text) => text.indexOf("archivedExisting") < text.indexOf("INSERT INTO maintenance.tire_records")],
];
function failures(text) { return checks.flatMap(([label, test]) => (test instanceof RegExp ? test.test(text) : test(text)) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-tire-replacement-source-cas FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const archivedExisting = await client.query", "await client.query"],
    ["operating_company_id = $2::uuid", "TRUE"],
    ["AND status = 'active'", ""],
    ["RETURNING id", ""],
    ["archivedExisting.rows.length !== 1", "false"],
    ["throw new Error(\"tire_replacement_source_archive_failed\")", "return"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-tire-replacement-source-cas --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-tire-replacement-source-cas PASS — replacement inserts only after one active company tire is archived");
