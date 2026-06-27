#!/usr/bin/env node
/**
 * verify-schema-parity.mjs — Schema-drift CI guard.
 *
 * Parses all migration SQL files in db/migrations/ to extract column definitions
 * (CREATE TABLE and ALTER TABLE ADD COLUMN), then diffs against the committed
 * baseline in docs/schema-parity-baseline.json.
 *
 * Fails on EITHER direction:
 *   • Column in baseline but not found in migrations → missing migration (prod has it, fresh-DB won't)
 *   • Column in migrations but not in baseline → untracked ALTER (fresh-DB has it, baseline is stale)
 *
 * Non-financial tooling — auto-merge on green CI.
 *
 * Usage:
 *   node scripts/verify-schema-parity.mjs           # CI gate (exit 1 on drift)
 *   node scripts/verify-schema-parity.mjs --update  # regenerate baseline from current migrations
 *   node scripts/verify-schema-parity.mjs --list    # print all known columns, sorted
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const BASELINE_PATH = path.join(ROOT, "docs", "schema-parity-baseline.json");

const UPDATE = process.argv.includes("--update");
const LIST = process.argv.includes("--list");

// Schemas to track. ALL app schemas — drift is the defect class everywhere.
// pg-internal schemas and the migration runner itself are excluded.
const EXCLUDED_SCHEMAS = new Set([
  "pg_catalog",
  "information_schema",
  "pg_temp",
  "ih35_migrations",
  "topology",
]);

// ─── SQL parser ─────────────────────────────────────────────────────────────

/** Strip SQL line comments (--) and block comments (/* *\/) from a chunk of SQL. */
function stripComments(sql) {
  // Block comments first (non-greedy, dotAll)
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Line comments
  s = s.replace(/--[^\n]*/g, " ");
  return s;
}

/** Normalise whitespace. */
function normalise(s) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse a CREATE TABLE statement body (the part inside the outer parens) and
 * return a list of column names.  We only extract names — the guard checks
 * presence/absence, not types (type changes are a separate concern).
 *
 * Returns an array of column name strings.
 */
function parseCreateTableColumns(body) {
  const cols = [];
  // Split on commas that are NOT inside nested parens (e.g. column constraints with (…)).
  let depth = 0;
  let start = 0;
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));

  for (const part of parts) {
    const trimmed = normalise(part);
    if (!trimmed) continue;
    // Skip table-level constraints (PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY, CONSTRAINT …)
    if (/^(primary\s+key|unique|check|foreign\s+key|constraint\s+\w)/i.test(trimmed)) continue;
    // Column name is the first token (may be quoted with "")
    const m = trimmed.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?\s/);
    if (m) cols.push(m[1].toLowerCase());
  }
  return cols;
}

/**
 * Parse migration SQL files and return a Map<"schema.table", Set<columnName>>.
 * Handles:
 *   CREATE TABLE [IF NOT EXISTS] schema.table ( … )
 *   ALTER TABLE schema.table ADD COLUMN [IF NOT EXISTS] col_name …
 *   ALTER TABLE schema.table ADD col_name …           (short form)
 *   ALTER TABLE schema.table RENAME COLUMN old TO new  (tracked)
 *   ALTER TABLE schema.table DROP COLUMN col           (tracked as removal)
 *
 * Note: DO $$ … $$ blocks with dynamic DDL are also parsed (same patterns).
 */
function parseMigrations(migrationsDir) {
  const schema = new Map(); // "schema.table" → Set<colName>

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // apply in filename order

  for (const file of files) {
    const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const sql = stripComments(raw);

    // ── CREATE TABLE ────────────────────────────────────────────────────────
    // Matches: CREATE TABLE [IF NOT EXISTS] [schema.]table (…)
    // We need to find the balanced closing paren.
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s*\(/gi;
    let m;
    while ((m = createRe.exec(sql)) !== null) {
      const relation = m[1].toLowerCase();
      const [schemaName] = relation.split(".");
      if (EXCLUDED_SCHEMAS.has(schemaName)) continue;

      // Find the balanced closing paren for the column list.
      const bodyStart = m.index + m[0].length;
      let depth = 1;
      let i = bodyStart;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") depth--;
        i++;
      }
      const body = sql.slice(bodyStart, i - 1);
      const cols = parseCreateTableColumns(body);

      if (!schema.has(relation)) schema.set(relation, new Set());
      const colSet = schema.get(relation);
      for (const c of cols) colSet.add(c);
    }

    // ── ALTER TABLE ADD COLUMN ──────────────────────────────────────────────
    // Two patterns:
    //   a) Single: ALTER TABLE schema.table ADD [COLUMN] [IF NOT EXISTS] col TYPE
    //   b) Multi : ALTER TABLE schema.table\n  ADD COLUMN … ,\n  ADD COLUMN … ,\n  …;
    // Strategy: find each ALTER TABLE schema.table occurrence, then scan the
    // substring up to the next ALTER/CREATE/END statement for all ADD COLUMN tokens.
    const alterTableRe =
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\b/gi;
    const addColFragRe =
      /\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s/gi;
    // Statement boundary: next top-level keyword that starts a new statement.
    const stmtBoundaryRe = /\b(?:ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|DO|BEGIN|COMMIT|ROLLBACK|END)\b/gi;

    while ((m = alterTableRe.exec(sql)) !== null) {
      const relation = m[1].toLowerCase();
      const [schemaName] = relation.split(".");
      if (EXCLUDED_SCHEMAS.has(schemaName)) continue;

      // Find the extent of this ALTER TABLE statement: up to the next statement boundary
      // or end of file. Use a generous window (2 KB) to cover wide multi-column ALTERs.
      const stmtStart = m.index + m[0].length;
      const window = sql.slice(stmtStart, stmtStart + 4096);

      // Scan window for all ADD COLUMN occurrences.
      addColFragRe.lastIndex = 0;
      let cm;
      while ((cm = addColFragRe.exec(window)) !== null) {
        const col = cm[1].toLowerCase();
        // Skip constraint keywords
        if (/^(primary|unique|check|constraint|foreign|set|drop|rename|enable|disable)$/i.test(col)) continue;
        if (!schema.has(relation)) schema.set(relation, new Set());
        schema.get(relation).add(col);
      }
    }

    // ── ALTER TABLE DROP COLUMN ─────────────────────────────────────────────
    const dropColRe =
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
    while ((m = dropColRe.exec(sql)) !== null) {
      const relation = m[1].toLowerCase();
      const col = m[2].toLowerCase();
      const [schemaName] = relation.split(".");
      if (EXCLUDED_SCHEMAS.has(schemaName)) continue;
      if (schema.has(relation)) schema.get(relation).delete(col);
    }

    // ── ALTER TABLE RENAME COLUMN ───────────────────────────────────────────
    const renameColRe =
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s+RENAME\s+COLUMN\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+TO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
    while ((m = renameColRe.exec(sql)) !== null) {
      const relation = m[1].toLowerCase();
      const oldCol = m[2].toLowerCase();
      const newCol = m[3].toLowerCase();
      const [schemaName] = relation.split(".");
      if (EXCLUDED_SCHEMAS.has(schemaName)) continue;
      if (schema.has(relation)) {
        schema.get(relation).delete(oldCol);
        schema.get(relation).add(newCol);
      }
    }
  }

  return schema;
}

/** Serialise the migration-derived schema to the baseline JSON format. */
function serialise(schemaMap) {
  const tables = {};
  const sortedRelations = [...schemaMap.keys()].sort();
  for (const rel of sortedRelations) {
    tables[rel] = [...schemaMap.get(rel)].sort();
  }
  return {
    generated_at: new Date().toISOString(),
    note: "Auto-generated by scripts/verify-schema-parity.mjs --update. Do not hand-edit.",
    tables,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const migrationSchema = parseMigrations(MIGRATIONS_DIR);

  if (LIST) {
    for (const [rel, cols] of [...migrationSchema.entries()].sort()) {
      console.log(`${rel}:`);
      for (const c of [...cols].sort()) console.log(`  ${c}`);
    }
    return;
  }

  if (UPDATE) {
    const baseline = serialise(migrationSchema);
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
    console.log(`verify-schema-parity: baseline updated → ${BASELINE_PATH}`);
    console.log(`  tables tracked: ${Object.keys(baseline.tables).length}`);
    return;
  }

  // ── Diff mode (CI gate) ─────────────────────────────────────────────────
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `verify-schema-parity FAILED: baseline not found at ${BASELINE_PATH}\n` +
        `Run: node scripts/verify-schema-parity.mjs --update`
    );
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const baselineTables = baseline.tables ?? {};

  const failures = [];

  // Check every table in the baseline against migration-derived schema.
  for (const [rel, baselineCols] of Object.entries(baselineTables)) {
    const migCols = migrationSchema.get(rel);
    if (!migCols) {
      // Entire table missing from migrations — that means the baseline references a
      // table that no migration creates. This is baseline drift (or a hand-applied table).
      // Only flag if the baseline has actual columns to avoid noise from empty stubs.
      if (baselineCols.length > 0) {
        failures.push(
          `TABLE_MISSING_FROM_MIGRATIONS: ${rel} (${baselineCols.length} columns in baseline, 0 in migrations)`
        );
      }
      continue;
    }
    for (const col of baselineCols) {
      if (!migCols.has(col)) {
        failures.push(`COLUMN_MISSING_FROM_MIGRATIONS: ${rel}.${col} (in baseline, not found in migration DDL)`);
      }
    }
  }

  // Check every table in migration-derived schema against baseline.
  for (const [rel, migCols] of migrationSchema.entries()) {
    const baselineCols = baselineTables[rel];
    if (!baselineCols) {
      // Table exists in migrations but not in baseline → baseline is stale.
      if (migCols.size > 0) {
        failures.push(
          `TABLE_NOT_IN_BASELINE: ${rel} (${migCols.size} columns in migrations, not in baseline — run --update)`
        );
      }
      continue;
    }
    const baselineSet = new Set(baselineCols);
    for (const col of migCols) {
      if (!baselineSet.has(col)) {
        failures.push(`COLUMN_NOT_IN_BASELINE: ${rel}.${col} (in migration DDL, not in baseline — run --update)`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`verify-schema-parity FAILED (${failures.length} drift item(s)):`);
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      `\nTo regenerate the baseline after a legitimate migration:\n  node scripts/verify-schema-parity.mjs --update\nThen commit docs/schema-parity-baseline.json.`
    );
    process.exit(1);
  }

  console.log(
    `verify-schema-parity OK — ${Object.keys(baselineTables).length} tables, ` +
      `${Object.values(baselineTables).reduce((s, c) => s + c.length, 0)} columns tracked`
  );
}

main();
