#!/usr/bin/env node
/**
 * Guard: verify-alert-rules-profiles.mjs
 * Validates W2B-ALERT-RULES-PROFILES files are present and correctly wired.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function expectFile(p) {
  if (!fs.existsSync(path.join(ROOT, p))) failures.push(`MISSING: ${p}`);
}
function expectContains(p, pattern, label) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${p}`); return; }
  if (!pattern.test(fs.readFileSync(abs, "utf8"))) failures.push(`${p}: missing ${label}`);
}
function expectNotContains(p, pattern, label) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return;
  if (pattern.test(fs.readFileSync(abs, "utf8"))) failures.push(`${p}: forbidden pattern — ${label}`);
}

expectFile("db/migrations/202606111057_w2b_alert_rules.sql");
expectFile("db/migrations/202606111102_w2b_alerts_schema_grants.sql");
expectContains("db/migrations/202606111102_w2b_alerts_schema_grants.sql", /GRANT\s+USAGE\s+ON\s+SCHEMA\s+alerts\s+TO\s+ih35_app/i, "alerts schema grant");
expectContains("db/migrations/202606111057_w2b_alert_rules.sql", /create\s+schema.*alerts/i, "alerts schema");
expectContains("db/migrations/202606111057_w2b_alert_rules.sql", /enable\s+row\s+level\s+security/i, "RLS");
expectFile("apps/backend/src/alerts/alert.routes.ts");
expectContains("apps/backend/src/alerts/alert.routes.ts", /alerts\./i, "alerts schema reference");
expectNotContains("db/migrations/202606111057_w2b_alert_rules.sql", /insert\s+into\s+accounting/i, "no financial writes");
expectContains("package.json", /"verify:alert-rules-profiles"\s*:/, "verify script in package.json");
expectContains(".github/workflows/ci.yml", /verify:alert-rules-profiles/, "CI gate step");

if (failures.length > 0) {
  console.error("verify:alert-rules-profiles FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify:alert-rules-profiles PASS");
