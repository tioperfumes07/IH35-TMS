#!/usr/bin/env node
/**
 * ACCT-LINK-01 — journal_entries must FK catalogs.journal_entry_types (not stay an island).
 *
 * Static checks (no DB):
 *  1. HELD migration adds journal_entry_type_id → catalogs.journal_entry_types
 *  2. Migration is registered in .held-migrations.json
 *  3. createJournalEntry path is col-gated + resolves type (GENERAL default for manual)
 *  4. POST body accepts journal_entry_type_id / journal_entry_type_code
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202607940000_journal_entries_type_fk.sql";
const HELD = "db/migrations/.held-migrations.json";
const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const ROUTES = "apps/backend/src/accounting/journal-entries.routes.ts";

let failed = 0;
function fail(msg) {
  console.error(`verify-journal-entries-type-fk: ${msg}`);
  failed = 1;
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const mig = read(MIGRATION);
if (mig) {
  if (!/HOLD-FOR-JORGE/.test(mig)) fail(`${MIGRATION} must carry HOLD-FOR-JORGE marker`);
  if (!/DO NOT RUN ON PROD/.test(mig)) fail(`${MIGRATION} must carry DO NOT RUN ON PROD marker`);
  if (!/ADD COLUMN journal_entry_type_id uuid REFERENCES catalogs\.journal_entry_types/.test(mig)) {
    fail(`${MIGRATION} must ADD COLUMN journal_entry_type_id REFERENCES catalogs.journal_entry_types`);
  }
  if (!/idx_journal_entries_type_id/.test(mig)) {
    fail(`${MIGRATION} must create idx_journal_entries_type_id`);
  }
}

const held = read(HELD);
if (held && !held.includes("202607940000_journal_entries_type_fk.sql")) {
  fail(`${HELD} missing ledger entry for ${MIGRATION}`);
}

const service = read(SERVICE);
if (service) {
  if (!/hasJournalEntryTypeColumn/.test(service)) {
    fail(`${SERVICE} must col-gate via hasJournalEntryTypeColumn`);
  }
  if (!/resolveJournalEntryTypeId/.test(service)) {
    fail(`${SERVICE} must resolve catalog type via resolveJournalEntryTypeId`);
  }
  if (!/journal_entry_type_id/.test(service) || !/GENERAL/.test(service)) {
    fail(`${SERVICE} must write journal_entry_type_id and default manual to GENERAL`);
  }
  if (!/INSERT INTO accounting\.journal_entries \([\s\S]*journal_entry_type_id/.test(service)) {
    fail(`${SERVICE} INSERT must include journal_entry_type_id when column present`);
  }
}

const routes = read(ROUTES);
if (routes) {
  if (!/journal_entry_type_id:\s*z\.string\(\)\.uuid\(\)/.test(routes)) {
    fail(`${ROUTES} create body must accept journal_entry_type_id`);
  }
  if (!/journal_entry_type_code:\s*z\.string\(\)/.test(routes)) {
    fail(`${ROUTES} create body must accept journal_entry_type_code`);
  }
  if (!/journal_entry_type_not_found/.test(routes)) {
    fail(`${ROUTES} must map journal_entry_type_not_found to 400`);
  }
}

if (failed) process.exit(1);
console.log(
  "verify-journal-entries-type-fk: OK — migration + held ledger + col-gated create wire present (Neon-apply still required for PASS)."
);
