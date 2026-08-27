#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/reefer-hours.routes.ts", "utf8");
const block = source.match(/app\.post\("\/api\/v1\/maintenance\/reefer-hours\/log\/:id\/archive"[\s\S]*?\n  \}\);/)?.[0] ?? "";
const checks = [
  ["archive result captured", /const archived = await withCompany/],
  ["mutation result captured", /const result = await client\.query/],
  ["company and active archive predicate", /operating_company_id = \$2::uuid AND archived_at IS NULL/],
  ["identity returned", /RETURNING id::text/],
  ["missing row exits before audit", /if \(!result\.rows\[0\]\) return null;[\s\S]{0,180}appendCrudAudit/],
  ["honest not found", /if \(!archived\) return reply\.code\(404\).*reefer_hours_log_not_found_or_already_archived/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-reefer-hours-archive-failure-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["const archived = await withCompany", "await withCompany"],
    ["const result = await client.query", "await client.query"],
    ["AND archived_at IS NULL", ""],
    ["RETURNING id::text", ""],
    ["if (!result.rows[0]) return null;", ""],
    ["if (!archived) return reply.code(404).send({ error: \"reefer_hours_log_not_found_or_already_archived\" });", ""],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log(`verify-reefer-hours-archive-failure-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`); process.exit(0);
}
console.log("verify-reefer-hours-archive-failure-truth PASS — archive success and audit require one active company log row");
