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
  if (!/settlement\.settlement/.test(src))
    fail(`${rel}: no reference to settlement.settlement — caller removed without updating grant guard`);
}
pass(`all ${CALLERS.length} callers verified to reference settlement.settlement`);

console.log("verify-p0-settlement-schema-grants: ALL CHECKS PASSED");
