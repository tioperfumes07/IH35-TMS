#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/fuel/fuel-transactions.routes.ts", "utf8");
const block = source.match(/app\.patch\([\s\S]*?"\/api\/v1\/fuel\/transactions\/:id\/load"[\s\S]*?\n  \);/)?.[0] ?? "";
const checks = [
  ["rate limited", /rateLimit: \{ max: 120, timeWindow: "1 minute" \}/],
  ["active company mutation", /UPDATE fuel\.fuel_transactions[\s\S]{0,500}WHERE id = \$1::uuid AND operating_company_id = \$2::uuid AND archived_at IS NULL[\s\S]{0,80}RETURNING/],
  ["mutation identity returned", /RETURNING id::text AS id/],
  ["updated row captured", /const updatedRow = updated\.rows\[0\] \?\? null/],
  ["zero-row exits before audit", /if \(!updatedRow\) return \{ error: "fuel_transaction_changed_during_attribution" as const \};[\s\S]{0,180}appendCrudAudit/],
  ["honest conflict", /fuel_transaction_changed_during_attribution"\) return reply\.code\(409\)/],
];
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
const problems = failures(block);
if (problems.length) { console.error(`verify-fuel-load-attribution-failure-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["WHERE id = $1::uuid AND operating_company_id = $2::uuid AND archived_at IS NULL\n          RETURNING", "WHERE id = $1::uuid AND operating_company_id = $2::uuid\n          RETURNING"],
    ["RETURNING id::text AS id", "RETURNING load_id::text AS load_id"],
    ["const updatedRow = updated.rows[0] ?? null;", ""],
    ["if (!updatedRow) return { error: \"fuel_transaction_changed_during_attribution\" as const };", ""],
    ["return reply.code(409)", "return reply.code(200)"],
  ];
  for (const [from, to] of mutations) { const changed = block.replace(from, to); if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped or missing: ${from}`); process.exit(1); } }
  console.log("verify-fuel-load-attribution-failure-truth --selftest PASS (5/5 planted defects red)"); process.exit(0);
}
console.log("verify-fuel-load-attribution-failure-truth PASS — attribution audit/success require one active company fuel row");
