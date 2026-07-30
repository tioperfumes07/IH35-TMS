#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const MIGRATIONS = path.join(ROOT, "db/migrations");
const RUNTIME_ROLE = "ih35_app";
const SKIP_SCHEMAS = new Set([
  "information_schema",
  "pg_catalog",
  "_system",
  "ih35_migrations",
  "public",
  "views",
]);

const SCHEMA_MATCH_RE = /\b(FROM|JOIN)\s+([a-z_][a-z0-9_]*)\./gi;

/**
 * Return the [start, end) character ranges of every /* ... *\/ block comment
 * in `src`. Used so a FROM/JOIN match that falls inside one is ignored.
 */
function blockCommentRanges(src) {
  const ranges = [];
  for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInRange(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Extract lowercased schema names referenced by `FROM <schema>.` / `JOIN
 * <schema>.` in real (non-comment) source text. A match is dropped when:
 *   - it falls inside a /* block comment *\/, or
 *   - a `//` line-comment marker appears earlier on the same physical line
 *     (prose like "// Downloaded from R2." must never look like SQL).
 * This is a heuristic, not a full TS/JS tokenizer — it deliberately errs
 * toward dropping ambiguous matches rather than inventing schema names that
 * don't exist, since the false-positive class (comment prose read as SQL)
 * is what breaks CI on unrelated PRs. It does NOT touch the actual
 * migration-grant check below, so a genuinely ungranted real schema used
 * in real code still fails.
 */
export function extractSchemaReferences(src) {
  const blockRanges = blockCommentRanges(src);
  const schemas = new Set();
  for (const m of src.matchAll(SCHEMA_MATCH_RE)) {
    const idx = m.index;
    if (isInRange(idx, blockRanges)) continue;
    const lineStart = src.lastIndexOf("\n", idx) + 1;
    const linePrefix = src.slice(lineStart, idx);
    if (linePrefix.includes("//")) continue;
    schemas.add(m[2].toLowerCase());
  }
  return schemas;
}

function walkTs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

export function hasSchemaGrant(schema, sql, runtimeRole = RUNTIME_ROLE) {
  if (new RegExp(`GRANT\\s+USAGE\\s+ON\\s+SCHEMA\\s+${schema}\\s+TO\\s+${runtimeRole}`, "i").test(sql)) {
    return true;
  }
  if (
    new RegExp(`'${schema}'`, "i").test(sql) &&
    /GRANT\s+USAGE\s+ON\s+SCHEMA\s+%I/i.test(sql)
  ) {
    return true;
  }
  return false;
}

const SQL_FALSE_SCHEMAS = new Set([
  "excluded",
  // BANK-F13 (2026-07-30): table aliases in the superseded-duplicate predicate
  // (apps/backend/src/banking/pending-categorization.ts). They are correlated-subquery aliases for
  // banking.bank_accounts / banking.bank_transactions, not schemas — the scanner reads `self_acct.id`
  // as `<schema>.<table>` and demanded a GRANT USAGE for a schema that does not exist.
  "self_acct",
  "twin_acct",
  "twin_bt",
  "agg",
  "load_scope",
  "pay",
  "maint",
  "miles",
  "per_unit",
  "bounds",
  "bp",
  "qa",
  "qi",
  "qc",
  "qv",
  "process",
  "q",
]);

function runSelfTest() {
  const failures = [];

  // 1. Prose that reads like SQL ("from R2.") must NOT be picked up as a
  //    schema reference when it's on a // line-comment.
  const commentSrc = [
    "// Downloaded from R2. Do not re-upload.",
    "const x = 1;",
  ].join("\n");
  const commentSchemas = extractSchemaReferences(commentSrc);
  if (commentSchemas.has("r2")) {
    failures.push('FAIL: "// Downloaded from R2." was read as schema "r2" (line-comment not ignored)');
  }

  // 2. Same prose inside a /* */ block comment must also be ignored.
  const blockCommentSrc = [
    "/*",
    " * Copied from R2.",
    " */",
    "const y = 2;",
  ].join("\n");
  const blockSchemas = extractSchemaReferences(blockCommentSrc);
  if (blockSchemas.has("r2")) {
    failures.push('FAIL: block-comment "Copied from R2." was read as schema "r2" (block comment not ignored)');
  }

  // 3. A real SQL query in code must still be picked up (no over-suppression).
  const realSrc = 'const q = `SELECT id FROM mdata.loads JOIN catalogs.accounts ON true`;';
  const realSchemas = extractSchemaReferences(realSrc);
  if (!realSchemas.has("mdata") || !realSchemas.has("catalogs")) {
    failures.push("FAIL: real SQL FROM/JOIN in code was not detected — guard over-suppressed");
  }

  // 4. A real SQL query preceded on the SAME line by a // comment marker
  //    (e.g. inline trailing comment before code — pathological but must
  //    not crash) is a known limitation; not asserted here.

  // 5. hasSchemaGrant must still fail a genuinely ungranted schema.
  const migrationSqlFixture = "GRANT USAGE ON SCHEMA mdata TO ih35_app;";
  if (hasSchemaGrant("totally_ungranted_schema", migrationSqlFixture)) {
    failures.push("FAIL: hasSchemaGrant() returned true for a schema with no grant in the fixture (real-check weakened)");
  }
  if (!hasSchemaGrant("mdata", migrationSqlFixture)) {
    failures.push("FAIL: hasSchemaGrant() returned false for a schema with a real GRANT USAGE line (real-check broken)");
  }

  if (failures.length > 0) {
    console.error("verify:aggregate-schema-grants --selftest FAIL");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("verify:aggregate-schema-grants --selftest PASS (4 checks)");
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  runSelfTest();
}

const migrationSql = fs
  .readdirSync(MIGRATIONS)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => fs.readFileSync(path.join(MIGRATIONS, n), "utf8"))
  .join("\n");

const schemas = new Set();
for (const file of walkTs(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  for (const schema of extractSchemaReferences(src)) {
    schemas.add(schema);
  }
}

const missing = [];
for (const schema of [...schemas].sort()) {
  if (SKIP_SCHEMAS.has(schema) || SQL_FALSE_SCHEMAS.has(schema)) continue;
  if (!hasSchemaGrant(schema, migrationSql)) missing.push(schema);
}

if (missing.length > 0) {
  console.error(`verify:aggregate-schema-grants FAIL — no GRANT USAGE ON SCHEMA … TO ${RUNTIME_ROLE} in db/migrations for:`);
  for (const s of missing) console.error(`  ${s}`);
  process.exit(1);
}

console.log(`verify:aggregate-schema-grants PASS (${schemas.size} schemas scanned, ${missing.length} missing)`);
