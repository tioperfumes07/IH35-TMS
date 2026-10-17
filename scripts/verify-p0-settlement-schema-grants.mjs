#!/usr/bin/env node
// P0 CI guard — settlement.settlement schema grants.
//
// Invariant: the migration 202606271520_p0_settlement_schema_grants.sql must exist and
// must contain GRANT USAGE ON SCHEMA settlement and GRANT ... ON ALL TABLES ... to ih35_app.
// Also asserts that the four known callers of settlement.* tables are still present
// (so the guard fires if the migration is removed without also removing the callers, or
// vice-versa — a caller is added without a grant).
//
// Run: node scripts/verify-p0-settlement-schema-grants.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(`FAIL verify-p0-settlement-schema-grants: ${msg}`); process.exit(1); };
const pass = (msg) => console.log(`PASS verify-p0-settlement-schema-grants: ${msg}`);

// ── 1. Migration file exists ──────────────────────────────────────────────────
const MIGRATION = "db/migrations/202606271560_p0_settlement_schema_grants.sql";
const migPath = join(root, MIGRATION);
if (!existsSync(migPath)) fail(`migration file missing: ${MIGRATION}`);
const migSql = readFileSync(migPath, "utf8");
if (!/GRANT USAGE ON SCHEMA settlement TO ih35_app/i.test(migSql))
  fail(`${MIGRATION}: missing GRANT USAGE ON SCHEMA settlement TO ih35_app`);
if (!/GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA settlement TO ih35_app/i.test(migSql))
  fail(`${MIGRATION}: missing GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA settlement TO ih35_app`);
pass("migration file present and contains required GRANT statements");

// ── 2. Known callers reference settlement.* tables ───────────────────────────
// approval.routes.ts is a thin Fastify HTTP layer — it never writes SQL itself; ALL settlement.*
// access is delegated to approval.service.ts (imported as `approvalService`), which IS still
// directly checked below for the settlement.settlement reference. A router file that delegates
// its SQL to an already-checked service module carries the same grant dependency transitively —
// require the delegation import instead of a literal SQL string that a clean routes/service split
// will never contain.
const DELEGATES_TO = {
  "apps/backend/src/settlements/approval.routes.ts": {
    module: "./approval.service.js",
    checkedAs: "apps/backend/src/settlements/approval.service.ts",
  },
};
// REPOINTED (round 443.187): settlement-pdf-renderer.service.ts never ran SQL against the
// settlement.* schema — its only match was the JS property access `settlement.settlement_model`
// added in 352bc13a98 ("load-bookended settlement model ..."), which 415e7cc628 ("fix(truck-line):
// station node must outrank the truck graphic ...", #23394) removed. The renderer reads the
// canonical store (driver_finance.driver_settlements, LINKAGE LAW §10 / P2.4a repoint 2026-07-15).
// Same rule — this caller's settlement read must be on a granted, named store — checked against
// the store it actually reads, never skipped.
const REPOINTED_TO_CANONICAL = {
  "apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts": /\bFROM\s+driver_finance\.driver_settlements\b/,
};
const CALLERS = [
  "apps/backend/src/settlements/approval.service.ts",
  "apps/backend/src/settlements/approval.routes.ts",
  "apps/backend/src/settlements/pre-settlements.routes.ts",
  "apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts",
];
for (const rel of CALLERS) {
  const fp = join(root, rel);
  if (!existsSync(fp)) fail(`expected caller missing from codebase: ${rel}`);
  const src = readFileSync(fp, "utf8");
  if (REPOINTED_TO_CANONICAL[rel]) {
    if (REPOINTED_TO_CANONICAL[rel].test(src)) continue;
    fail(`${rel}: no read of the canonical driver_finance.driver_settlements store — settlement caller moved without updating grant guard`);
  }
  if (/settlement\.settlement/.test(src)) continue;
  const delegate = DELEGATES_TO[rel];
  if (delegate && new RegExp(delegate.module.replace(/[.[\]]/g, "\\$&")).test(src) && CALLERS.includes(delegate.checkedAs)) {
    continue;
  }
  fail(`${rel}: no reference to settlement.settlement — caller removed without updating grant guard`);
}
pass(`all ${CALLERS.length} callers verified to reference settlement.settlement (directly, via a checked delegate, or repointed to the canonical driver_finance store)`);

console.log("verify-p0-settlement-schema-grants: ALL CHECKS PASSED");
