#!/usr/bin/env node
/**
 * GUARD: no NEW `deleted_at` column may be added to any table, ever again.
 *
 * WHY THIS EXISTS — VOID-COLUMN-CONVENTION-LAW-2026-09-03 (docs/specs/VOID-COLUMN-CONVENTION-LAW-2026-09-03.md,
 * docs/law/LAW.json LAW-2026-09-03-VOID-COLUMN-CONVENTION), owner-ruled after CC-2 measured four
 * interchangeable "this record is off" columns (deactivated_at 189 files, voided_at 107, deleted_at 36,
 * revoked_at 18) and refused to rename any of them unilaterally. The ruling: three conventions, each
 * with exactly one meaning (voided_at = money reversed, deactivated_at = still real/not selectable,
 * revoked_at = access withdrawn) — deleted_at is retired going forward, full stop. The 36 files the
 * owner's own count named include comments, WHERE clauses and references to a column defined
 * elsewhere; this guard's baseline (below) counts something narrower and more precise for
 * enforcement purposes — migration files that actually DEFINE a new deleted_at column (CREATE TABLE
 * or ADD COLUMN), which is the only thing this rule can mechanically prevent going forward. The
 * existing ones convert OPPORTUNISTICALLY (same PR as whoever next touches that table for another
 * reason) — never a big-bang rename, never DROP.
 *
 * RATCHET, not a one-time count: the number of migration files defining a deleted_at column may only
 * ever stay the same or go DOWN (a conversion lowers it; nothing may raise it).
 *
 * Usage:  node scripts/verify-no-new-deleted-at-columns.mjs
 *         node scripts/verify-no-new-deleted-at-columns.mjs --selftest
 *         node scripts/verify-no-new-deleted-at-columns.mjs --print
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-new-deleted-at-columns";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

/** Baseline = migration files DEFINING a deleted_at column, measured 2026-09-03 when this guard
 * landed (CREATE TABLE / ADD COLUMN with a real type, not a bare mention). May only go DOWN. */
const BASELINE = 15;

/** A column definition, not a comment/WHERE/index reference: `deleted_at` immediately followed by a
 * real SQL type keyword. Case-insensitive; SQL is not case-sensitive on keywords. */
const DELETED_AT_COLUMN_RE = /\bdeleted_at\s+(timestamp(?:tz)?|date|boolean)\b/i;

export function fileDefinesDeletedAtColumn(sqlText) {
  const lines = sqlText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue; // line comment
    if (DELETED_AT_COLUMN_RE.test(line)) return true;
  }
  return false;
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function countOffenders() {
  const files = listMigrationFiles();
  const offenders = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    if (fileDefinesDeletedAtColumn(text)) offenders.push(f);
  }
  return offenders;
}

function runSelftest() {
  const withColumn = `
    -- some comment mentioning deleted_at, not a column
    CREATE TABLE foo.bar (
      id uuid PRIMARY KEY,
      deleted_at timestamptz
    );
  `;
  if (!fileDefinesDeletedAtColumn(withColumn)) {
    throw new Error("selftest: a real `deleted_at timestamptz` column definition must be detected — it was not");
  }
  const addColumn = `ALTER TABLE foo.bar ADD COLUMN deleted_at timestamp;`;
  if (!fileDefinesDeletedAtColumn(addColumn)) {
    throw new Error("selftest: `ADD COLUMN deleted_at timestamp` must be detected — it was not");
  }
  const commentOnly = `-- deleted_at is retired, never add it, see VOID-COLUMN-CONVENTION-LAW`;
  if (fileDefinesDeletedAtColumn(commentOnly)) {
    throw new Error("selftest: a comment merely mentioning deleted_at must NOT be flagged as a column definition — it was");
  }
  const whereOnly = `SELECT * FROM foo.bar WHERE deleted_at IS NULL;`;
  if (fileDefinesDeletedAtColumn(whereOnly)) {
    throw new Error("selftest: a WHERE clause referencing an existing deleted_at column must NOT be flagged as a new definition — it was");
  }
  console.log(`[${LABEL}] --selftest OK (real column definition detected, ADD COLUMN detected, comment-only and WHERE-only both correctly ignored)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const offenders = countOffenders();

if (process.argv.includes("--print")) {
  for (const f of offenders) console.log(f);
}

if (offenders.length > BASELINE) {
  console.error(`${LABEL} — FAILED`);
  console.error(`  deleted_at column definitions: ${offenders.length} (baseline ${BASELINE}, may only go down)`);
  console.error(`  VOID-COLUMN-CONVENTION-LAW-2026-09-03: never add deleted_at to a new table — use voided_at`);
  console.error(`  (money reversed), deactivated_at (still real, not selectable), or revoked_at (access withdrawn).`);
  console.error(`  Run with --print to list the offending migration files.`);
  process.exit(1);
}

if (offenders.length < BASELINE) {
  console.error(`${LABEL} — FAILED`);
  console.error(`  deleted_at column definitions dropped to ${offenders.length} (baseline ${BASELINE}) — lower BASELINE in this script to match, so the ratchet never drifts back up silently.`);
  process.exit(1);
}

console.log(`[${LABEL}] OK — ${offenders.length} deleted_at column definition(s), at baseline, none new`);
