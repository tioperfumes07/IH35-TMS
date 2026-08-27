#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/tires.routes.ts", "utf8");
const block = source.match(/app\.patch\("\/api\/v1\/maintenance\/tires\/records\/:id"[\s\S]*?\n  \}\);/)?.[0] ?? "";
const checks = [
  ["mutation result captured", /const updated = await client\.query/],
  ["company and active predicate", /operating_company_id = \$\$\{values\.length\}::uuid AND status <> 'archived'/],
  ["identity returned", /RETURNING id::text/],
  ["lost update exits before audit", /if \(!updated\.rows\[0\]\) return null;[\s\S]{0,180}appendCrudAudit/],
  ["not-found response", /if \(!row\) return reply\.code\(404\)/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-tire-record-update-failure-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const updated = await client.query", "await client.query"],
    ["AND status <> 'archived'", ""],
    ["RETURNING id::text", ""],
    ["if (!updated.rows[0]) return null;", ""],
    ["if (!row) return reply.code(404)", "if (!row) return reply.code(200)"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-tire-record-update-failure-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-tire-record-update-failure-truth PASS — edit success and audit require one non-archived company tire row");
