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
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    // Skip a LIKE clause: `CREATE TABLE a (LIKE b INCLUDING DEFAULTS)` declares no column named
    // "like" — it copies b's columns. Taking the first token here invented a phantom column `like`
    // on accounting.qbo_vendors / qbo_customers / qbo_accounts AND left those tables with no real
    // columns at all, so schema-parity could not have detected a removal on any of them. The
    // inherited columns are resolved in parseMigrations, which is where the source table is known.
    if (/^like\s/i.test(trimmed)) continue;
    // Column name is the first token (may be quoted with "")
    const m = trimmed.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?\s/);
    if (m) cols.push(m[1].toLowerCase());
  }
  return cols;
}

/**
 * Return the source relations named by `LIKE source_table` clauses in a CREATE TABLE body.
 * Postgres copies the source's columns into the new table; the baseline must do the same or the
 * new table appears to have no columns.
 */
export function parseCreateTableLikeSources(body) {
  const sources = [];
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
    const m = trimmed.match(/^like\s+([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)/i);
    if (m) sources.push(m[1].toLowerCase());
  }
  return sources;
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
export function parseMigrations(migrationsDir) {
  const schema = new Map(); // "schema.table" → Set<colName>
  // "schema.table" → Set of relations it inherits columns from via `CREATE TABLE x (LIKE y …)`.
  const likeEdges = new Map();

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
    // DROP TABLE and CREATE TABLE are collected together and applied in SOURCE ORDER. A table that is
    // dropped and recreated with a different shape (migration 0201 does exactly this to
    // accounting.qbo_remote_counts) otherwise keeps the UNION of its old and new columns forever:
    // entity_key / count_value / last_polled_at survived in the baseline long after the drop, so the
    // baseline claimed three columns a freshly-migrated database does not have.
    const tableEvents = [];

    const dropTableRe = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)/gi;
    let d;
    while ((d = dropTableRe.exec(sql)) !== null) {
      tableEvents.push({ idx: d.index, kind: "drop", relation: d[1].toLowerCase() });
    }

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
      tableEvents.push({
        idx: m.index,
        kind: "create",
        relation,
        cols: parseCreateTableColumns(body),
        likeSources: parseCreateTableLikeSources(body),
      });
    }

    tableEvents.sort((a, b) => a.idx - b.idx);
    for (const ev of tableEvents) {
      const [evSchema] = ev.relation.split(".");
      if (EXCLUDED_SCHEMAS.has(evSchema)) continue;

      if (ev.kind === "drop") {
        // The table is gone; so is every column it had. A later CREATE repopulates it.
        schema.delete(ev.relation);
        likeEdges.delete(ev.relation);
        continue;
      }

      if (!schema.has(ev.relation)) schema.set(ev.relation, new Set());
      const colSet = schema.get(ev.relation);
      for (const c of ev.cols) colSet.add(c);

      // LIKE copies the source's columns AS THEY EXIST AT THIS POINT in migration order — later
      // ALTERs to the source are NOT propagated. So inherit immediately from the current snapshot when
      // the source is already known. Resolving against the source's FINAL state instead over-inherited
      // 9 columns onto accounting.qbo_vendors (account_number, billing_*, tax_id, terms, track_*) that
      // were added to mdata.qbo_vendors AFTER the LIKE and do not exist on the copy — the DB meta-guard
      // caught it. Only a source not yet seen is deferred to the post-pass.
      for (const src of ev.likeSources) {
        const snapshot = schema.get(src);
        if (snapshot && snapshot.size > 0) {
          for (const c of snapshot) colSet.add(c);
        } else {
          if (!likeEdges.has(ev.relation)) likeEdges.set(ev.relation, new Set());
          likeEdges.get(ev.relation).add(src);
        }
      }
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

      // Find the extent of this ALTER TABLE statement. An ALTER ends at its semicolon, so that is
      // the boundary; the 4 KB cap remains as a backstop for a pathological unterminated statement.
      //
      // BUG FIXED 2026-07-28 (LST-LINK-02): the window was capped at 4 KB but NEVER stopped at the
      // statement end, despite the comment claiming it did. Consecutive ALTERs in one file therefore
      // bled into each other and every table absorbed the following tables' columns. This was not
      // theoretical — the committed baseline contained accounting.bill_lines.ps_enforced_at, a column
      // that exists on accounting.bills and on NO other table (0266 declares it at the fourth ALTER
      // in the file; prod information_schema confirms bill_lines does not have it). A drift guard
      // whose baseline asserts columns that do not exist gives false assurance in BOTH directions:
      // it cannot see a real removal, and it invents work that was never done.
      const stmtStart = m.index + m[0].length;
      const capped = sql.slice(stmtStart, stmtStart + 4096);
      const terminator = capped.indexOf(";");
      const window = terminator === -1 ? capped : capped.slice(0, terminator);

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

  // ── Resolve LIKE inheritance ────────────────────────────────────────────────
  // `CREATE TABLE a (LIKE b INCLUDING …)` copies b's columns into a. Resolved here, after every
  // migration has been parsed, because the source may be created in a later file. Iterated to a
  // fixed point so a chain (a LIKE b, b LIKE c) resolves fully; the visited set makes a cycle
  // terminate instead of hanging.
  for (const [target, sources] of likeEdges) {
    if (!schema.has(target)) schema.set(target, new Set());
    const targetCols = schema.get(target);
    const seen = new Set([target]);
    const queue = [...sources];
    while (queue.length > 0) {
      const src = queue.shift();
      if (seen.has(src)) continue;
      seen.add(src);
      for (const c of schema.get(src) ?? []) targetCols.add(c);
      for (const next of likeEdges.get(src) ?? []) queue.push(next);
    }
  }

  return schema;
}

/** Serialise the migration-derived schema to the baseline JSON format. */
export function serialise(schemaMap) {
  const tables = {};
  const sortedRelations = [...schemaMap.keys()].sort();
  for (const rel of sortedRelations) {
    tables[rel] = [...schemaMap.get(rel)].sort();
  }
  return {
    // Keep committed output stable across no-op regeneration. This prevents timestamp-only
    // baseline churn and the committed-file conflicts that churn can cause. It does not prevent
    // schema-driven baseline changes, unrelated PR failures, or conflicts in other files.
    note: "Auto-generated by scripts/verify-schema-parity.mjs --update. Do not hand-edit. No-op regeneration is byte-deterministic.",
    tables,
  };
}

export function compareBaselineTables(migrationSchema, baselineTables) {
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

  return failures;
}

function parseRootArg(args) {
  const equalsArg = args.find((arg) => arg.startsWith("--root="));
  if (equalsArg) return path.resolve(equalsArg.slice("--root=".length));
  const index = args.indexOf("--root");
  if (index >= 0) {
    if (!args[index + 1]) throw new Error("--root requires a path");
    return path.resolve(args[index + 1]);
  }
  return ROOT;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function main(args = process.argv.slice(2)) {
  const root = parseRootArg(args);
  const migrationsDir = path.join(root, "db", "migrations");
  const baselinePath = path.join(root, "docs", "schema-parity-baseline.json");
  const update = args.includes("--update");
  const list = args.includes("--list");
  const migrationSchema = parseMigrations(migrationsDir);

  if (list) {
    for (const [rel, cols] of [...migrationSchema.entries()].sort()) {
      console.log(`${rel}:`);
      for (const c of [...cols].sort()) console.log(`  ${c}`);
    }
    return;
  }

  if (update) {
    const baseline = serialise(migrationSchema);
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n", "utf8");
    console.log(`verify-schema-parity: baseline updated → ${baselinePath}`);
    console.log(`  tables tracked: ${Object.keys(baseline.tables).length}`);
    return;
  }

  // ── Diff mode (CI gate) ─────────────────────────────────────────────────
  if (!fs.existsSync(baselinePath)) {
    console.error(
      `verify-schema-parity FAILED: baseline not found at ${baselinePath}\n` +
        `Run: node scripts/verify-schema-parity.mjs --update`
    );
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const baselineTables = baseline.tables ?? {};
  const failures = compareBaselineTables(migrationSchema, baselineTables);

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

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();
