#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const BACKFILL_SQL = path.join(ROOT, "scripts", "batch-8-ledger-backfill.sql");
const MISSING_LIST = path.join(ROOT, "docs", "batch-8", "missing-migrations.txt");
const NORMAL_LIST = path.join(ROOT, "docs", "batch-8", "normal-ledgered-migrations.txt");
const MIGRATION_NAME = /^\d{4}[a-z]?_.+\.sql$/i;

function fail(message) {
  console.error(`verify:no-unledgered-migrations FAILED\n- ${message}`);
  process.exit(1);
}

function readLines(file) {
  if (!fs.existsSync(file)) fail(`missing required file: ${path.relative(ROOT, file)}`);
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseBackfillInserts(sql) {
  const out = [];
  const insertRegex =
    /insert\s+into\s+_system\._schema_migrations\s*\([^)]*filename[^)]*\)\s*values\s*\(\s*'([^']+)'/gim;
  let match;
  while ((match = insertRegex.exec(sql)) !== null) out.push(match[1]);
  return [...new Set(out)];
}

function isDynamicTarget(raw) {
  return /%I|%L|%s|\$\{|format\s*\(/i.test(raw);
}

function collectCreates(sql) {
  const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/gi)].map((m) => m[1]);
  const views = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/gi)].map(
    (m) => m[1]
  );
  const indexes = [...sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([^\s]+)/gi)].map(
    (m) => m[1]
  );
  return [...tables, ...views, ...indexes];
}

function detectSubsequentRetirements(target, kind, subsequentSql) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dropKind = kind === "index" ? "index" : kind === "view" ? "view" : "table";
  const renameKind = dropKind;
  const dropPattern = new RegExp(String.raw`drop\s+${dropKind}\s+(?:if\s+exists\s+)?${escaped}\b`, "i");
  const renamePattern = new RegExp(
    String.raw`alter\s+${renameKind}\s+(?:if\s+exists\s+)?${escaped}\s+rename\s+to\s+("?[\w$]+"?)`,
    "i"
  );
  for (const sql of subsequentSql) {
    if (dropPattern.test(sql)) return true;
    if (renamePattern.test(sql)) return true;
  }
  return false;
}

if (!fs.existsSync(MIGRATIONS_DIR)) fail("db/migrations directory missing");
const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => MIGRATION_NAME.test(name))
  .sort((a, b) => a.localeCompare(b));
if (migrationFiles.length === 0) fail("db/migrations has no SQL files");

const missing = [...new Set(readLines(MISSING_LIST))].sort((a, b) => a.localeCompare(b));
const normal = [...new Set(readLines(NORMAL_LIST))].sort((a, b) => a.localeCompare(b));
const missingSet = new Set(missing);
const normalSet = new Set(normal);
const trackedFiles = [...new Set([...missing, ...normal])].sort((a, b) => a.localeCompare(b));
const maxTracked = trackedFiles.at(-1) ?? null;

for (const file of [...missing, ...normal]) {
  if (!MIGRATION_NAME.test(file)) fail(`invalid migration filename in docs/batch-8 lists: ${file}`);
  if (!migrationFiles.includes(file)) fail(`listed migration not found in db/migrations: ${file}`);
}

for (const file of missing) {
  if (normalSet.has(file)) fail(`migration listed in both missing and normal lists: ${file}`);
}

for (const file of migrationFiles) {
  if (maxTracked !== null && file.localeCompare(maxTracked) > 0) continue;
  if (!missingSet.has(file) && !normalSet.has(file)) {
    fail(`unaccounted migration file (neither missing nor normal): ${file}`);
  }
}

if (!fs.existsSync(BACKFILL_SQL)) fail("missing scripts/batch-8-ledger-backfill.sql");
const sqlText = fs.readFileSync(BACKFILL_SQL, "utf8");
const backfillMigrations = parseBackfillInserts(sqlText).sort((a, b) => a.localeCompare(b));

if (backfillMigrations.length !== missing.length) {
  fail(`backfill insert count (${backfillMigrations.length}) must equal missing count (${missing.length})`);
}

for (const file of missing) {
  if (!backfillMigrations.includes(file)) fail(`missing migration not inserted in backfill SQL: ${file}`);
}

for (const file of backfillMigrations) {
  if (!missingSet.has(file)) fail(`backfill SQL contains migration not in missing list: ${file}`);
}

// Refined rule encoding for future batches:
// 1) dynamic placeholders are not statically verifiable
// 2) targets retired by subsequent migrations are not required to exist as originally named
const sqlByMigration = new Map(
  trackedFiles.map((file) => [file, fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").toLowerCase()])
);
const unresolvedStaticTargets = [];
for (let i = 0; i < trackedFiles.length; i += 1) {
  const file = trackedFiles[i];
  const sql = sqlByMigration.get(file) ?? "";
  const targets = collectCreates(sql);
  const subsequent = trackedFiles.slice(i + 1).map((f) => sqlByMigration.get(f) ?? "");
  for (const rawTarget of targets) {
    if (isDynamicTarget(rawTarget)) continue;
    const lowerTarget = rawTarget.toLowerCase();
    const kind = sql.includes(`create view ${rawTarget}`) ? "view" : sql.includes(`create index ${rawTarget}`) ? "index" : "table";
    if (detectSubsequentRetirements(lowerTarget, kind, subsequent)) continue;
    unresolvedStaticTargets.push(`${file}:${rawTarget}`);
  }
}

if (unresolvedStaticTargets.length === 0) {
  fail("unexpected parse outcome: unresolved static target set is empty");
}

console.log(
  JSON.stringify({
    event: "verify_no_unledgered_migrations_ok",
    migration_count: migrationFiles.length,
    missing_count: missing.length,
    normal_count: normal.length,
    unresolved_static_targets: unresolvedStaticTargets.length,
  })
);
