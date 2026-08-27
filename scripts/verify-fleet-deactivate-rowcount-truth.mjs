#!/usr/bin/env node
import fs from "node:fs";
const targets = [
  ["equipment", "apps/backend/src/mdata/equipment.routes.ts", /app\.post\("\/api\/v1\/mdata\/equipment\/:id\/deactivate"[\s\S]*?\n  \}\);/],
  ["units", "apps/backend/src/mdata/units.routes.ts", /app\.post\("\/api\/v1\/mdata\/units\/:id\/deactivate"[\s\S]*?\n  \}\);/],
];
const checks = [
  ["deactivation rate limited", /rateLimit: \{ max: 30, timeWindow: "1 minute" \}/],
  ["mutation result captured", /const result = await client\.query/],
  ["active predicate", /AND deactivated_at IS NULL/],
  ["owner or lessee scope", /owner_company_id = \$[34] OR currently_leased_to_company_id = \$[34]/],
  ["exact row count required", /if \(result\.rowCount !== 1\) return null;/],
  ["row check before timestamp", /if \(result\.rowCount !== 1\) return null;[\s\S]{0,900}SELECT now\(\) AS deactivated_at/],
];
function blockFor(path, pattern) { return fs.readFileSync(path, "utf8").match(pattern)?.[0] ?? ""; }
function failures(text) { return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]); }
for (const [name, path, pattern] of targets) {
  const block = blockFor(path, pattern);
  const problems = failures(block);
  if (problems.length) { console.error(`verify-fleet-deactivate-rowcount-truth FAILED ${name}:\n${problems.map((p) => ` - ${p}`).join("\n")}`); process.exit(1); }
}
if (process.argv.includes("--selftest")) {
  for (const [name, path, pattern] of targets) {
    const block = blockFor(path, pattern);
    for (const [from, to] of [
      ["rateLimit: { max: 30, timeWindow: \"1 minute\" }", ""],
      ["const result = await client.query", "await client.query"],
      ["AND deactivated_at IS NULL", ""],
      ["if (result.rowCount !== 1) return null;", ""],
    ]) {
      const changed = block.replace(from, to);
      if (changed === block || failures(changed).length === 0) { console.error(`selftest mutation escaped ${name}: ${from}`); process.exit(1); }
    }
  }
  console.log("verify-fleet-deactivate-rowcount-truth --selftest PASS (8/8 planted defects red)"); process.exit(0);
}
console.log("verify-fleet-deactivate-rowcount-truth PASS — unit and equipment deactivation require one scoped active mutation");
