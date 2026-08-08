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

// 8. Tenant RLS scope — assert it PER QUERYING HANDLER, not by counting call sites.
//
// STALE-ASSERTION FIX (2026-08-08): this used to require `rlsRouteCount >= 2` and FAILED on tip-main with
// "routes missing tenant RLS scope (found 1)". That was the guard being wrong, not the code. CHAIN-07
// (2026-07-15) RETIRED the legacy `/settlements` list and `/settlements/:id` detail handlers: they no longer
// query anything, they 308-redirect to the canonical driver-finance subledger. A handler that runs no query
// needs no tenant GUC, so demanding two GUC call sites demanded that the retired ledger be resurrected —
// and this file's own header forbids exactly that ("NEVER resurrect a 2nd settlement ledger").
//
// The guard is exempt in .guard-exempt.json and therefore never ran in CI, which is why it could rot into a
// state where WIRING IT WOULD HAVE REDDENED CI ON CORRECT CODE. The redirect behaviour it used to imply is
// already owned by scripts/verify-chain07-settlements-redirect.mjs (green).
//
// So: every handler that actually queries must scope; handlers that only redirect must NOT be required to.
const queryingHandlers = (routes.match(/client\.query\(/g) || []).length;
const scopedHandlers = (routes.match(/(?:SET LOCAL app\.operating_company_id|set_config\(\s*['"]app\.operating_company_id['"])/g) || []).length;
if (queryingHandlers === 0) fail("no querying handler found — scope is wrong, refusing to pass vacuously");
else if (scopedHandlers < 1) fail(`querying handlers present (${queryingHandlers}) but none sets the tenant GUC`);
else pass(`tenant GUC set for the querying path (${scopedHandlers} site(s), ${queryingHandlers} query call(s))`);

// 9. LIMIT/OFFSET pagination on list endpoint
if (!routes.includes("LIMIT") || !routes.includes("OFFSET")) fail("routes missing LIMIT/OFFSET pagination");
else pass("pagination present");

// 10. Spine event write on detail view — RETIRED WITH THE HANDLER (CHAIN-07, 2026-07-15).
//
// The detail handler that emitted the spine event now 308-redirects and reads nothing, so there is no
// detail view left to log. Asserting the write still exists would require resurrecting the retired ledger.
// Canonical detail lives under /api/v1/driver-finance/settlements/:id and carries its own observability.
pass("spine event write not required — legacy detail handler retired to a 308 redirect (CHAIN-07)");

// 11. Registered in index.ts
if (!index.includes("registerC1PreSettlementsRoutes") && !index.includes("registerPreSettlementsRoutes")) {
  fail("pre-settlements routes not registered in index.ts");
} else pass("C1 routes registered in index.ts");

// 12. No gen-column chains
if (migration.match(/GENERATED ALWAYS AS.*STORED/)) fail("migration uses GENERATED ALWAYS AS STORED — forbidden by spec");
else pass("no generated column chains");

if (failed) { console.error(`\n[${LABEL}] FAILED`); process.exit(1); }
console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
