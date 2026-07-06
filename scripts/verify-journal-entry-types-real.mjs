#!/usr/bin/env node
/**
 * Static guard for AF-5 (Journal Entry Types stub -> real catalog):
 *
 *  1. `registerJournalEntryTypesReadOnlyRoutes` must delegate to the generic
 *     `registerLegacyAccountingCatalogRoutes` factory against `catalogs.journal_entry_types` — it must
 *     NEVER regress back to a hardcoded in-file `rows = [...]` array (the original SILENT-STUB found by
 *     the 2026-06-24 recon, docs/recon/stub-inventory-2026-06-24.md).
 *  2. The HELD migration that creates the real table must exist, must carry the DO-NOT-RUN marker, and
 *     must be registered in .held-migrations.json (never self-merge a catalogs.* migration).
 *
 * Pure file-content checks — no DB required. Safe to run in CI even though the migration itself is
 * HOLD-FOR-JORGE and has not been run anywhere yet.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ROUTE_FILE = "apps/backend/src/catalogs/accounting/factory.ts";
const MIGRATION = "db/migrations/202607120000_af5_journal_entry_types_catalog.sql";
const HELD_LEDGER = "db/migrations/.held-migrations.json";

let failed = 0;
function fail(msg) {
  console.error(`verify-journal-entry-types-real: ${msg}`);
  failed = 1;
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`expected file is missing: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const routeSrc = read(ROUTE_FILE);
if (routeSrc) {
  if (/const rows\s*=\s*\[\s*\{\s*id:\s*"11111111-1111-4111-8111-111111111111"/.test(routeSrc)) {
    fail(`${ROUTE_FILE} regressed to the hardcoded synthetic-UUID rows array for Journal Entry Types.`);
  }
  const fnMatch = routeSrc.match(/export function registerJournalEntryTypesReadOnlyRoutes\([\s\S]*?\n\}/);
  if (!fnMatch) {
    fail(`${ROUTE_FILE} no longer exports registerJournalEntryTypesReadOnlyRoutes.`);
  } else if (!/registerLegacyAccountingCatalogRoutes\(app,\s*\{[\s\S]*tableName:\s*"journal_entry_types"/.test(fnMatch[0])) {
    fail(`${ROUTE_FILE}: registerJournalEntryTypesReadOnlyRoutes must delegate to registerLegacyAccountingCatalogRoutes against catalogs.journal_entry_types (real table), not a hardcoded array.`);
  }
}

const migration = read(MIGRATION);
if (migration) {
  if (!/DO NOT MERGE\. DO NOT RUN ON PROD/.test(migration)) {
    fail(`${MIGRATION} is missing the DO-NOT-RUN HOLD marker — a catalogs.* migration must never look mergeable by default.`);
  }
  if (!/CREATE TABLE IF NOT EXISTS catalogs\.journal_entry_types/.test(migration)) {
    fail(`${MIGRATION} must create catalogs.journal_entry_types.`);
  }
  if (!/GRANT SELECT, INSERT, UPDATE ON catalogs\.journal_entry_types TO ih35_app/.test(migration)) {
    fail(`${MIGRATION} must grant SELECT/INSERT/UPDATE (no DELETE — void-not-delete) on catalogs.journal_entry_types to ih35_app.`);
  }
  if (/GRANT[^;]*\bDELETE\b[^;]*\bON\s+catalogs\.journal_entry_types\b/i.test(migration)) {
    fail(`${MIGRATION} must not GRANT DELETE on catalogs.journal_entry_types (void-not-delete via is_active).`);
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(migration)) {
    fail(`${MIGRATION} must FORCE row level security on catalogs.journal_entry_types.`);
  }
}

const ledger = read(HELD_LEDGER);
if (ledger && !ledger.includes("202607120000_af5_journal_entry_types_catalog.sql")) {
  fail(`${HELD_LEDGER} is missing the entry for ${MIGRATION} — a held catalogs.* migration must be registered or it could silently fire on prod.`);
}

if (failed) {
  process.exit(1);
}
console.log("verify-journal-entry-types-real: OK — Journal Entry Types is a real DB-backed catalog (no hardcoded rows), HELD migration present + ledger-registered.");
