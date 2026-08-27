#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/reefer-hours.routes.ts", "utf8");
const block = source.match(/app\.put\("\/api\/v1\/maintenance\/reefer-hours\/specs"[\s\S]*?\n  \}\);/)?.[0] ?? "";
const checks = [
  ["mutation result captured", /const updated = await client\.query/],
  ["company and active predicate", /operating_company_id = \$\$\{values\.length\}::uuid AND archived_at IS NULL/],
  ["identity returned", /RETURNING id::text/],
  ["lost update exits before audit", /if \(!updated\.rows\[0\]\) return null;[\s\S]{0,180}appendCrudAudit/],
  ["honest conflict response", /if \(!row\) return reply\.code\(409\).*reefer_specs_changed_during_update/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-reefer-specs-update-failure-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const updated = await client.query", "await client.query"],
    ["AND archived_at IS NULL", ""],
    ["RETURNING id::text", ""],
    ["if (!updated.rows[0]) return null;", ""],
    ["if (!row) return reply.code(409).send({ error: \"reefer_specs_changed_during_update\" });", ""],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-reefer-specs-update-failure-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-reefer-specs-update-failure-truth PASS — specs update success and audit require one active company row");
