#!/usr/bin/env node
/**
 * verify-migration-no-runtime-raise.mjs  —  BLOCK-RELIABILITY-07
 *
 * Codifies the #1495 lesson: a migration must NEVER hard-fail (RAISE) based on the
 * PRESENCE/ABSENCE of runtime/QBO-synced DATA. #1495 added a migration with
 * `RAISE EXCEPTION` when TRANSP lacked a QBO-synced account; on a CI FRESH DB (no
 * such data) the RAISE fired and broke fresh-DB replay. It "passed" only on a
 * prod-COPY branch where the data existed. Migrations must replay green on an empty
 * DB from 0001 — so RAISE may key on STRUCTURE (catalogs/pg_catalog/information_schema),
 * never on rows in a DATA table.
 *
 * SCOPE / CORRECTNESS:
 *   - Flags only MIGRATION-TIME raises: those in a `DO $$ ... $$` block or top-level.
 *   - Does NOT flag RAISE inside a `CREATE [OR REPLACE] FUNCTION ... $$ ... $$` body —
 *     those run at call-time (e.g. trigger validation), not during migration replay,
 *     and are legitimate. (This is the key false-positive guard.)
 *   - Only aborting raises count (RAISE EXCEPTION / RAISE 'msg' / RAISE SQLSTATE);
 *     RAISE NOTICE/WARNING/LOG/INFO/DEBUG are non-aborting and ignored.
 *   - A flag requires an aborting migration-time RAISE preceded (within its block /
 *     a 30-line window) by a SELECT/FROM against a DATA table (mdata/accounting/
 *     driver_finance/banking/factor/fuel/hos/dispatch/sales/geo/catalogs.* etc.),
 *     excluding structural refs (information_schema, pg_catalog, pg_ catalogs, to_regclass).
 *
 * MODE: ADVISORY by default (lists offenders, exit 0). Set
 * MIGRATION_RAISE_LINT_ENFORCE=true to make it blocking (exit 1) once the backlog is
 * clean — wire advisory into CI first, then flip to enforce. (Same OFF/advisory-first
 * pattern as the R-05 heartbeat.)
 *
 * Mirrors the style of scripts/ci-migration-guard.mjs. Pure static analysis — no DB.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const ENFORCE = process.env.MIGRATION_RAISE_LINT_ENFORCE === "true";
const WINDOW = 30; // lines to look back for a data-table reference

const DATA_SCHEMA_RE =
  /\b(mdata|accounting|driver_finance|banking|factor|fuel|hos|dispatch|sales|geo|events|catalogs)\.[a-z_][a-z0-9_]*/i;
const STRUCTURAL_RE =
  /\b(information_schema|pg_catalog|pg_class|pg_namespace|pg_roles|pg_tables|pg_proc|pg_attribute|to_regclass|to_regtype|has_schema_privilege|has_table_privilege)\b/i;
const ABORTING_RAISE_RE = /\braise\s+(exception|sqlstate|'|")/i; // not notice/warning/log/info/debug
const FUNC_OPEN_RE = /\bcreate\s+(or\s+replace\s+)?function\b/i;

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Returns array of {file, line, raiseText, dataRef} offenders for one migration.
 * Tracks dollar-quoted bodies to know whether a RAISE is inside a FUNCTION (skip) or
 * a DO/top-level block (candidate). Simple single-tag tracker — handles the common
 * `$$` and `$name$` forms used across this repo's migrations.
 */
function scanFile(file) {
  const full = path.join(MIGRATIONS_DIR, file);
  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
  const offenders = [];

  let inDollar = false; // inside any $tag$ ... $tag$ body
  let dollarTag = null;
  let bodyKind = null; // 'function' | 'do' | null
  let pendingFunc = false; // saw CREATE FUNCTION, awaiting its opening $tag$

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // detect dollar-quote tag toggles ($$ or $name$)
    const tags = lower.match(/\$[a-z0-9_]*\$/g) || [];
    for (const t of tags) {
      if (!inDollar) {
        inDollar = true;
        dollarTag = t;
        bodyKind = pendingFunc ? "function" : "do";
        pendingFunc = false;
      } else if (t === dollarTag) {
        inDollar = false;
        dollarTag = null;
        bodyKind = null;
      }
    }

    if (FUNC_OPEN_RE.test(lower)) pendingFunc = true;

    // candidate = aborting RAISE that is NOT inside a function body
    if (ABORTING_RAISE_RE.test(lower) && bodyKind !== "function") {
      // look back within the window for a data-table ref that is NOT structural
      let dataRef = null;
      for (let j = i; j >= Math.max(0, i - WINDOW); j--) {
        const back = lines[j];
        if (STRUCTURAL_RE.test(back)) continue;
        const m = back.match(DATA_SCHEMA_RE);
        if (m && /\b(select|from|join|exists|count|into)\b/i.test(back)) {
          dataRef = m[0];
          break;
        }
      }
      if (dataRef) {
        offenders.push({ file, line: i + 1, raiseText: line.trim().slice(0, 100), dataRef });
      }
    }
  }
  return offenders;
}

function main() {
  const migrations = listMigrations();
  const offenders = migrations.flatMap(scanFile);

  if (offenders.length === 0) {
    console.log(`[anti-RAISE-lint] PASS — no migration-time RAISE conditioned on data-table rows (${migrations.length} files scanned).`);
    process.exit(0);
  }

  const header = ENFORCE ? "ANTI-RAISE LINT FAILED" : "ANTI-RAISE LINT — ADVISORY (not blocking)";
  console.error(`\n${header}`);
  console.error("=".repeat(64));
  console.error("Migration-time RAISE keyed on a DATA table → breaks fresh-DB replay (the #1495 class).");
  console.error("Gate RAISE on STRUCTURE only (catalogs schema existence / pg_catalog / information_schema),");
  console.error("never on whether runtime/QBO-synced rows exist. Move data assertions to app-layer fail-loud.\n");
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}`);
    console.error(`     RAISE: ${o.raiseText}`);
    console.error(`     data-ref in window: ${o.dataRef}`);
  }
  console.error("=".repeat(64));
  console.error(`${offenders.length} offender(s).`);

  if (ENFORCE) process.exit(1);
  console.error("Advisory mode (MIGRATION_RAISE_LINT_ENFORCE!=true) — not failing the build.");
  process.exit(0);
}

main();
