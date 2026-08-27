#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/inspections.routes.ts", "utf8");
const block = source.match(/app\.patch\("\/api\/v1\/maintenance\/inspections\/:id"[\s\S]*?\n  \}\);/)?.[0] ?? "";
const checks = [
  ["mutation result captured", /const mutation = await client\.query/],
  ["company active mutation", /operating_company_id = \$\$\{values\.length\}::uuid AND archived_at IS NULL/],
  ["identity returned", /RETURNING id::text/],
  ["lost update exits", /if \(!mutation\.rows\[0\]\) return null;/],
  ["company-scoped readback", /WHERE i\.id = \$1 AND i\.operating_company_id = \$2::uuid LIMIT 1/],
  ["missing readback exits before audit", /const updatedRow = detail\.rows\[0\];[\s\S]{0,80}if \(!updatedRow\) return null;[\s\S]{0,220}appendCrudAudit/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-inspection-update-failure-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const mutation = await client.query", "await client.query"],
    ["operating_company_id = $${values.length}::uuid AND archived_at IS NULL", "operating_company_id = $${values.length}::uuid"],
    ["RETURNING id::text", ""],
    ["if (!mutation.rows[0]) return null;", ""],
    ["AND i.operating_company_id = $2::uuid", ""],
    ["if (!updatedRow) return null;", ""],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-inspection-update-failure-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-inspection-update-failure-truth PASS — edit requires one active company mutation and scoped readback");
