#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/mdata/driver-default-truck.routes.ts", "utf8");
const block = source.match(/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/clear-default-truck"[\s\S]*?\n  \}\);/)?.[0] ?? "";
const checks = [
  ["rate limited", /rateLimit: \{ max: 30, timeWindow: "1 minute" \}/],
  ["mutation result captured", /const cleared = await client\.query/],
  ["company active default predicate", /operating_company_id = \$2::uuid[\s\S]{0,100}is_default = true[\s\S]{0,100}ended_at IS NULL/],
  ["identity returned", /RETURNING id::text/],
  ["zero-row exits before audit", /if \(!cleared\.rows\[0\]\) return \{ error: "no_active_default_truck" as const \};[\s\S]{0,180}appendCrudAudit/],
  ["honest conflict", /if \("error" in result\) return reply\.code\(409\)/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-driver-clear-default-truck-failure-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["rateLimit: { max: 30, timeWindow: \"1 minute\" }", ""],
    ["const cleared = await client.query", "await client.query"],
    ["AND ended_at IS NULL", ""],
    ["RETURNING id::text", ""],
    ["if (!cleared.rows[0]) return { error: \"no_active_default_truck\" as const };", ""],
    ["if (\"error\" in result) return reply.code(409)", "if (\"error\" in result) return reply.code(200)"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log("verify-driver-clear-default-truck-failure-truth --selftest PASS (6/6 planted defects red)"); process.exit(0);
}
console.log("verify-driver-clear-default-truck-failure-truth PASS — clear requires one active company default assignment");
