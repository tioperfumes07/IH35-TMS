#!/usr/bin/env node
/**
 * Guard: verify-profitability-engine.mjs
 * Validates W2A-PROFITABILITY-ENGINE files are present and correctly wired.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function expectFile(relativePath) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) {
    failures.push(`MISSING: ${relativePath}`);
  }
}

function expectContains(relativePath, pattern, label) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${relativePath}`); return; }
  if (!pattern.test(fs.readFileSync(abs, "utf8"))) {
    failures.push(`${relativePath}: missing ${label}`);
  }
}

function expectNotContains(relativePath, pattern, label) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) return;
  if (pattern.test(fs.readFileSync(abs, "utf8"))) {
    failures.push(`${relativePath}: contains forbidden pattern — ${label}`);
  }
}

// 1. Migration and grants present
expectFile("db/migrations/202606111056_w2a_profitability_engine.sql");
expectFile("db/migrations/202606111101_w2a_analytics_schema_grants.sql");
expectContains(
  "db/migrations/202606111101_w2a_analytics_schema_grants.sql",
  /GRANT\s+USAGE\s+ON\s+SCHEMA\s+analytics\s+TO\s+ih35_app/i,
  "GRANT USAGE ON SCHEMA analytics TO ih35_app"
);

// 2. Migration has required tables + RLS
expectContains("db/migrations/202606111056_w2a_profitability_engine.sql", /create\s+schema.*analytics/i, "analytics schema");
expectContains("db/migrations/202606111056_w2a_profitability_engine.sql", /load_fact/i, "load_fact table");
expectContains("db/migrations/202606111056_w2a_profitability_engine.sql", /enable\s+row\s+level\s+security/i, "RLS");

// 3. Backend routes present
expectFile("apps/backend/src/profitability/profitability.routes.ts");
expectContains("apps/backend/src/profitability/profitability.routes.ts", /analytics\.load_fact/i, "analytics.load_fact reference");

// 4. Frontend pages present
expectFile("apps/frontend/src/pages/profitability/ProfitabilityPage.tsx");
expectFile("apps/frontend/src/pages/profitability/ByLaneView.tsx");
expectFile("apps/frontend/src/pages/profitability/ByTypeView.tsx");
expectFile("apps/frontend/src/pages/profitability/ByCustomerView.tsx");
expectFile("apps/frontend/src/pages/profitability/ByLoadView.tsx");
expectFile("apps/frontend/src/pages/profitability/FilterBar.tsx");
expectFile("apps/frontend/src/pages/profitability/KpiStrip.tsx");

// 5. No financial writes in migration
expectNotContains("db/migrations/202606111056_w2a_profitability_engine.sql", /insert\s+into\s+accounting/i, "insert into accounting");

// 6. CI wired
expectContains("package.json", /"verify:profitability-engine"\s*:/, "verify:profitability-engine script");
expectContains(".github/workflows/ci.yml", /verify:profitability-engine/, "CI gate step");

if (failures.length > 0) {
  console.error("verify:profitability-engine FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify:profitability-engine PASS");
