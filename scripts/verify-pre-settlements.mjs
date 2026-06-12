#!/usr/bin/env node
/**
 * verify-pre-settlements.mjs
 * Guards for C1-PRE-SETTLEMENTS block.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-pre-settlements";
let failed = false;

function fail(msg) { console.error(`[${LABEL}] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[${LABEL}] PASS: ${msg}`); }
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing file: ${rel}`); return ""; }
  return fs.readFileSync(abs, "utf8");
}

const MIGRATION = "db/migrations/202606120100_c1_pre_settlements.sql";
const ROUTES    = "apps/backend/src/settlements/pre-settlements.routes.ts";
const INDEX     = "apps/backend/src/index.ts";

const migration = read(MIGRATION);
const routes    = read(ROUTES);
const index     = read(INDEX);

// 1. Migration creates settlement schema
if (!migration.includes("CREATE SCHEMA IF NOT EXISTS settlement")) fail("migration missing: CREATE SCHEMA IF NOT EXISTS settlement");
else pass("migration creates settlement schema");

// 2. All 3 tables present
for (const tbl of ["settlement.settlement", "settlement.settlement_line", "settlement.settlement_deduction"]) {
  if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`)) fail(`migration missing table: ${tbl}`);
  else pass(`table defined: ${tbl}`);
}

// 3. RLS enabled on all tables
const rlsCount = (migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
if (rlsCount < 3) fail(`only ${rlsCount}/3 tables have RLS enabled`);
else pass(`RLS enabled on all 3 tables`);

// 4. NULLIF pattern in RLS policies
if (!migration.includes("NULLIF(current_setting")) fail("RLS policies missing NULLIF(current_setting...) pattern");
else pass("NULLIF RLS pattern present");

// 5. updated_at triggers defined
const trigCount = (migration.match(/CREATE TRIGGER/g) || []).length;
if (trigCount < 3) fail(`only ${trigCount}/3 updated_at triggers`);
else pass(`${trigCount} updated_at triggers defined`);

// 6. No financial writes (no posting/close mutation)
const MUTATION_MARKERS = ["INSERT INTO settlement.settlement", "UPDATE settlement.settlement", "DELETE FROM settlement"];
for (const m of MUTATION_MARKERS) {
  if (routes.includes(m)) fail(`routes must be read-only — found mutation: ${m}`);
}
pass("routes are read-only (no settlement INSERT/UPDATE/DELETE)");

// 7. 3 required GET endpoints
for (const ep of ["/api/v1/settlements\"", "/api/v1/settlements/:id\"", "/api/v1/settlements/pending-deductions\""]) {
  if (!routes.includes(ep)) fail(`missing endpoint: ${ep}`);
  else pass(`endpoint present: ${ep}`);
}

// 8. RLS SET LOCAL in routes
const rlsRouteCount = (routes.match(/SET LOCAL app\.operating_company_id/g) || []).length;
if (rlsRouteCount < 2) fail(`routes missing SET LOCAL RLS (found ${rlsRouteCount})`);
else pass(`SET LOCAL RLS applied in ${rlsRouteCount} handlers`);

// 9. LIMIT/OFFSET pagination on list endpoint
if (!routes.includes("LIMIT") || !routes.includes("OFFSET")) fail("routes missing LIMIT/OFFSET pagination");
else pass("pagination present");

// 10. Spine event write on detail view
if (!routes.includes("events.log_event")) fail("routes missing spine event write (events.log_event)");
else pass("spine event write present");

// 11. Registered in index.ts
if (!index.includes("registerC1PreSettlementsRoutes") && !index.includes("registerPreSettlementsRoutes")) {
  fail("pre-settlements routes not registered in index.ts");
} else pass("C1 routes registered in index.ts");

// 12. No gen-column chains
if (migration.match(/GENERATED ALWAYS AS.*STORED/)) fail("migration uses GENERATED ALWAYS AS STORED — forbidden by spec");
else pass("no generated column chains");

if (failed) { console.error(`\n[${LABEL}] FAILED`); process.exit(1); }
console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
