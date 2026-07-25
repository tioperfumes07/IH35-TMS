#!/usr/bin/env node
/**
 * ACCT-F02 / ACCT-LINK-01 — journal_entries.journal_entry_type_id typed FK + JE-type picker wiring.
 *
 * Layers:
 *  1. Static — migration file + held registry + backend col-gate + JE create/edit picker (always).
 *  2. Prod SQL — when DATABASE_URL targets prod, FAIL if column absent (MERGED≠APPLIED honesty).
 *
 * Local/CI throwaway Postgres skips layer 2 (202607960000 is HELD — not in migrate path).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { targetIsProd } from "./lib/prod-target-guard.mjs";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LABEL = "verify-je-type-fk";

const MIGRATION = "db/migrations/202607960000_journal_entries_type_fk.sql";
const HELD = "db/migrations/.held-migrations.json";
const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const ROUTES = "apps/backend/src/accounting/journal-entries.routes.ts";
const API = "apps/frontend/src/api/accounting.ts";
const PICKER = "apps/frontend/src/components/accounting/JournalEntryTypePicker.tsx";
const MANUAL_JE = "apps/frontend/src/components/accounting/ManualJEModal.tsx";
const BANKING_MANUAL_JE = "apps/frontend/src/pages/banking/components/ManualJEModal.tsx";
const DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const FACTORY = "apps/backend/src/catalogs/accounting/factory.ts";

function read(rel, failures) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

function collectStaticFailures(files) {
  const failures = [];

  const mig = files.migration;
  if (mig) {
    if (!/HOLD-FOR-JORGE/.test(mig)) failures.push(`${MIGRATION} must carry HOLD-FOR-JORGE marker`);
    if (!/DO NOT RUN ON PROD/.test(mig)) failures.push(`${MIGRATION} must carry DO NOT RUN ON PROD marker`);
    if (!/ADD COLUMN journal_entry_type_id uuid REFERENCES catalogs\.journal_entry_types/.test(mig)) {
      failures.push(`${MIGRATION} must ADD COLUMN journal_entry_type_id REFERENCES catalogs.journal_entry_types`);
    }
    if (!/idx_journal_entries_type_id/.test(mig)) {
      failures.push(`${MIGRATION} must create idx_journal_entries_type_id`);
    }
    if (!/information_schema\.columns[\s\S]*journal_entry_type_id/.test(mig)) {
      failures.push(`${MIGRATION} must probe information_schema.columns for journal_entry_type_id (idempotent)`);
    }
  }

  const held = files.held;
  if (held && !held.includes("202607960000_journal_entries_type_fk.sql")) {
    failures.push(`${HELD} missing ledger entry for ${MIGRATION}`);
  }

  const service = files.service;
  if (service) {
    if (!/hasJournalEntryTypeColumn/.test(service)) {
      failures.push(`${SERVICE} must col-gate via hasJournalEntryTypeColumn`);
    }
    if (!/resolveJournalEntryTypeId/.test(service)) {
      failures.push(`${SERVICE} must resolve catalog type via resolveJournalEntryTypeId`);
    }
    if (!/journal_entry_type_id/.test(service) || !/GENERAL/.test(service)) {
      failures.push(`${SERVICE} must write journal_entry_type_id and default manual to GENERAL`);
    }
    if (!/INSERT INTO accounting\.journal_entries \([\s\S]*journal_entry_type_id/.test(service)) {
      failures.push(`${SERVICE} INSERT must include journal_entry_type_id when column present`);
    }
    if (!/202607960000/.test(service)) {
      failures.push(`${SERVICE} must reference HELD migration 202607960000 (not a stale number)`);
    }
  }

  const routes = files.routes;
  if (routes) {
    if (!/journal_entry_type_id:\s*z\.string\(\)\.uuid\(\)/.test(routes)) {
      failures.push(`${ROUTES} create body must accept journal_entry_type_id`);
    }
    if (!/journal_entry_type_code:\s*z\.string\(\)/.test(routes)) {
      failures.push(`${ROUTES} create body must accept journal_entry_type_code`);
    }
    if (!/journal_entry_type_not_found/.test(routes)) {
      failures.push(`${ROUTES} must map journal_entry_type_not_found to 400`);
    }
  }

  const api = files.api;
  if (api) {
    if (!/journal_entry_type_id\?:/.test(api)) {
      failures.push(`${API} createJournalEntry payload must accept journal_entry_type_id`);
    }
    if (!/listJournalEntryTypesForJe/.test(api)) {
      failures.push(`${API} must export listJournalEntryTypesForJe reading catalogs.journal_entry_types`);
    }
  }

  const picker = files.picker;
  if (picker) {
    if (!/journalEntryTypesCatalogClient/.test(picker)) {
      failures.push(`${PICKER} must read catalogs.journal_entry_types via journalEntryTypesCatalogClient`);
    }
    if (!/allowAddNew/.test(picker)) {
      failures.push(`${PICKER} must expose inline + Add new (Combobox allowAddNew)`);
    }
    if (!/journalEntryTypesCatalogClient\.create/.test(picker)) {
      failures.push(`${PICKER} inline create must write the same catalog table it reads`);
    }
    if (!/data-testid=\"journal-entry-type-picker\"/.test(picker)) {
      failures.push(`${PICKER} must carry data-testid="journal-entry-type-picker"`);
    }
  }

  for (const [rel, src] of [
    [MANUAL_JE, files.manualJe],
    [BANKING_MANUAL_JE, files.bankingManualJe],
  ]) {
    if (!src) continue;
    if (!/JournalEntryTypePicker/.test(src)) {
      failures.push(`${rel} must mount JournalEntryTypePicker on the create path`);
    }
    if (!/journal_entry_type_id/.test(src)) {
      failures.push(`${rel} submit payload must include journal_entry_type_id`);
    }
  }

  const detail = files.detail;
  if (detail) {
    if (!/journal_entry_type/.test(detail)) {
      failures.push(`${DETAIL} must surface journal entry type for reverse drill`);
    }
    if (!/journal-entry-types/.test(detail)) {
      failures.push(`${DETAIL} must link to /lists/accounting/journal-entry-types`);
    }
  }

  const factory = files.factory;
  if (factory) {
    if (!/tableName:\s*"journal_entry_types"[\s\S]*?readOnly:\s*false/.test(factory)) {
      failures.push(`${FACTORY} journal_entry_types catalog must allow write (read=write picker law)`);
    }
  }

  return failures;
}

async function probeProdColumn() {
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.warn(`${LABEL}: no DATABASE_URL — prod SQL layer skipped (static only).`);
    return [];
  }
  if (!targetIsProd(cs)) {
    console.warn(`${LABEL}: DATABASE_URL is not prod — SQL column probe skipped (202607960000 is HELD on CI).`);
    return [];
  }

  const pool = new Pool({ connectionString: cs, max: 1 });
  try {
    const res = await pool.query(
      `SELECT count(*)::int AS n
         FROM information_schema.columns
        WHERE table_schema = 'accounting'
          AND table_name = 'journal_entries'
          AND column_name = 'journal_entry_type_id'`
    );
    if (Number(res.rows[0]?.n ?? 0) !== 1) {
      return [
        "PROD SQL: accounting.journal_entries.journal_entry_type_id absent — 202607960000 MERGED≠APPLIED (HELD, owner Neon-apply required). ACCT-LINK-01 stays FAIL until column live under lucia.",
      ];
    }
    console.log(`${LABEL}: prod SQL OK — journal_entry_type_id column present.`);
    return [];
  } finally {
    await pool.end();
  }
}

function selftest() {
  const good = {
    migration: fs.readFileSync(path.join(ROOT, MIGRATION), "utf8"),
    held: `"202607960000_journal_entries_type_fk.sql"`,
    service: `
      202607960000 hasJournalEntryTypeColumn resolveJournalEntryTypeId GENERAL
      INSERT INTO accounting.journal_entries (journal_entry_type_id
    `,
    routes: `journal_entry_type_id: z.string().uuid() journal_entry_type_code: z.string() journal_entry_type_not_found`,
    api: `journal_entry_type_id?: listJournalEntryTypesForJe`,
    picker: `
      journalEntryTypesCatalogClient.list allowAddNew journalEntryTypesCatalogClient.create
      data-testid="journal-entry-type-picker"
    `,
    manualJe: `JournalEntryTypePicker journal_entry_type_id`,
    bankingManualJe: `JournalEntryTypePicker journal_entry_type_id`,
    detail: `journal_entry_type_name /lists/accounting/journal-entry-types`,
    factory: `tableName: "journal_entry_types", readOnly: false`,
  };

  if (collectStaticFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    process.exit(1);
  }

  const badPicker = { ...good, manualJe: "createJournalEntry only" };
  if (!collectStaticFailures(badPicker).some((f) => f.includes(MANUAL_JE))) {
    console.error(`${LABEL} SELFTEST FAILED — missing picker wiring not caught`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = [];
const files = {
  migration: read(MIGRATION, failures),
  held: read(HELD, failures),
  service: read(SERVICE, failures),
  routes: read(ROUTES, failures),
  api: read(API, failures),
  picker: read(PICKER, failures),
  manualJe: read(MANUAL_JE, failures),
  bankingManualJe: read(BANKING_MANUAL_JE, failures),
  detail: read(DETAIL, failures),
  factory: read(FACTORY, failures),
};
failures.push(...collectStaticFailures(files));

if (failures.length) {
  console.error(`${LABEL}: FAIL (static)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const prodFailures = await probeProdColumn();
if (prodFailures.length) {
  console.error(`${LABEL}: FAIL (prod SQL — MERGED≠APPLIED)`);
  for (const f of prodFailures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL}: PASS — migration + held registry + col-gated backend + JE-type picker wired; prod column probe skipped or green.`
);
process.exit(0);
