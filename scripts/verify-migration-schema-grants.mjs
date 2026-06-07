#!/usr/bin/env node
/**
 * PREREQ-A Gate 4: Schema-level GRANT USAGE check.
 *
 * Scans all new migration files in db/migrations/ above the baseline
 * (migration num > 0406, including all timestamp-format migrations) for
 * CREATE SCHEMA statements.  For each schema created in a new migration,
 * verifies that GRANT USAGE ON SCHEMA <name> TO ih35_app appears somewhere
 * across the corpus of new migrations (same file or any co-committed file).
 *
 * Why this matters — the 0309_notification_center failure class:
 *   0309 added  CREATE SCHEMA notifications  +  table-level GRANTs to ih35_app
 *   but omitted  GRANT USAGE ON SCHEMA notifications TO ih35_app.
 *   PostgreSQL schema-level USAGE is required before any object within the
 *   schema is accessible; without it the app role gets "permission denied for
 *   schema notifications" at runtime even though the table GRANTs are present.
 *   This caused a login outage that was only fixed by a subsequent migration.
 *
 * This gate closes that entire failure class for all future migrations.
 *
 * Baseline: migrations at or below 0406 are grandfathered — the gate applies
 * only to new migrations (num > 0406 and all YYYYMMDD_HHMMSS_* timestamp files).
 *
 * Exit 0 — no new CREATE SCHEMA in new migrations, or every new schema has a
 *           corresponding GRANT USAGE ON SCHEMA … TO ih35_app.
 * Exit 1 — at least one new schema is missing GRANT USAGE → PR must be fixed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

/**
 * Migrations at or below this sequence number are grandfathered.
 * The gate only applies to files with a higher number (or timestamp names).
 */
const BASELINE_MIGRATION_NUM = 406;

function fail(msg) {
  console.error(`verify:migration-schema-grants FAIL: ${msg}`);
  process.exit(1);
}

/** Strip SQL line comments (--) and block comments. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/**
 * Return the numeric prefix of a migration filename.
 *   "0407_permits_toll_tags.sql"       → 407
 *   "20260607_143022_add_foo.sql"      → 20260607 (>> 406, always new)
 *   "non_numeric.sql"                  → 0
 */
function migrationNum(filename) {
  const m = filename.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extract all schema names from CREATE SCHEMA [IF NOT EXISTS] <name> statements.
 * Returns a Set of lower-cased schema names.
 */
function schemasCreated(sql) {
  const clean = stripComments(sql);
  const found = new Set();
  const re = /CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    found.add(m[1].toLowerCase());
  }
  return found;
}

/**
 * Extract all schema names that have  GRANT USAGE ON SCHEMA <name> TO ih35_app.
 * Returns a Set of lower-cased schema names.
 */
function schemasWithUsageGrant(sql) {
  const clean = stripComments(sql);
  const found = new Set();
  // Matches: GRANT USAGE ON SCHEMA <name> [, <name2>] TO ... ih35_app ...
  const re =
    /GRANT\s+USAGE\s+ON\s+SCHEMA\s+([\w\s,]+?)\s+TO\s+[^;]*\bih35_app\b/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    // The schema list may be comma-separated: "GRANT USAGE ON SCHEMA a, b TO ih35_app"
    const schemaList = m[1].split(",").map((s) => s.trim().toLowerCase());
    for (const s of schemaList) {
      if (s) found.add(s);
    }
  }
  return found;
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fail(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newFiles = allFiles.filter(
    (f) => migrationNum(f) > BASELINE_MIGRATION_NUM,
  );

  if (newFiles.length === 0) {
    console.log(
      `verify:migration-schema-grants PASS — no new migrations above baseline ${BASELINE_MIGRATION_NUM}`,
    );
    return;
  }

  // Pass 1: collect all schemas created in new migrations (file → Set<schemaName>)
  /** @type {Map<string, Set<string>>} filename → schema names created */
  const createdByFile = new Map();
  for (const file of newFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const schemas = schemasCreated(sql);
    if (schemas.size > 0) {
      createdByFile.set(file, schemas);
    }
  }

  if (createdByFile.size === 0) {
    console.log(
      `verify:migration-schema-grants PASS — ${newFiles.length} new migration(s) scanned, no CREATE SCHEMA found`,
    );
    return;
  }

  // Pass 2: collect all schemas that have GRANT USAGE … TO ih35_app across the
  // ENTIRE migration corpus (new + baseline).  The GRANT may live in:
  //   a) the same new migration that creates the schema (ideal)
  //   b) a co-committed new migration in the same PR
  //   c) a baseline migration that already established GRANT USAGE for an
  //      existing schema that a new migration touches with IF NOT EXISTS
  //
  // Case (c) is safe: the GRANT was already applied; the CREATE SCHEMA IF NOT
  // EXISTS is a no-op.  We only fail when no migration — old or new — grants
  // schema-level USAGE to ih35_app.
  const grantedSchemas = new Set();
  for (const file of allFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const s of schemasWithUsageGrant(sql)) {
      grantedSchemas.add(s);
    }
  }

  // Report: schemas created in new migrations that lack GRANT USAGE
  /** @type {Array<{ schema: string; file: string }>} */
  const violations = [];
  for (const [file, schemas] of createdByFile) {
    for (const schema of schemas) {
      if (!grantedSchemas.has(schema)) {
        violations.push({ schema, file });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      "verify:migration-schema-grants FAIL — schema(s) created in new migrations without GRANT USAGE ON SCHEMA … TO ih35_app:\n",
    );
    for (const { schema, file } of violations) {
      console.error(
        `  Schema '${schema}' created but GRANT USAGE ON SCHEMA ${schema} ... TO ih35_app not found.\n` +
          `  Add it to prevent login outages.  (introduced in: db/migrations/${file})`,
      );
    }
    console.error(
      "\nFix: in the same migration file (or a co-committed migration), add:\n" +
        "  GRANT USAGE ON SCHEMA <name> TO ih35_app;\n" +
        "\nThis is required in addition to object-level GRANTs (SELECT, INSERT, etc.).\n" +
        "Without it, PostgreSQL denies access to the schema namespace at the app role level,\n" +
        "causing login outages even when table-level permissions are present.\n" +
        "\nSee: docs/runbooks/migration-naming.md — 'Every CREATE SCHEMA must include GRANT USAGE'.",
    );
    process.exit(1);
  }

  const totalSchemas = [...createdByFile.values()].reduce(
    (sum, s) => sum + s.size,
    0,
  );
  console.log(
    `verify:migration-schema-grants PASS — ${totalSchemas} new schema(s) all have GRANT USAGE ON SCHEMA … TO ih35_app (${newFiles.length} new migration(s) scanned)`,
  );
}

main().catch((err) => fail(String(err?.message ?? err)));
