#!/usr/bin/env node
/**
 * verify-no-dead-schema — LAW OF THE LAND (§10a Total Connectivity) enforcement.
 *
 * WHY THIS EXISTS: §10a says every record/field must be wired to its financial primitives and
 * operational modules. That law was the ONLY law in this repo with no CI guard, so it kept being
 * substituted with the signals that DO have guards ("CI green", "file present on main"). Route
 * orphans get caught by verify-no-orphan-routes.mjs; COLUMN orphans had nothing. Result: columns
 * and tables shipped to prod that nothing ever reads (vendor_type_id, settlement_lines.disputed_at,
 * mdata.drivers.default_expense_account_id), implying features that do not exist.
 *
 * WHAT IT ASSERTS: every column/table created by a migration is referenced by at least one
 * NON-TEST source file under apps/backend/src or apps/frontend/src. A migration that adds storage
 * nothing reads is dead schema and fails this guard.
 *
 * ALLOWLIST: known-dead objects are listed below WITH A REASON, same convention as
 * verify-no-orphan-routes.mjs. New dead schema NOT in the list fails. Removing an entry (by wiring
 * it) is the goal; adding one is a deliberate, reviewable decision.
 *
 * Run: node scripts/verify-no-dead-schema.mjs [--selftest]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "db/migrations");
const SOURCE_ROOTS = [join(ROOT, "apps/backend/src"), join(ROOT, "apps/frontend/src")];

// Columns every table carries; presence is structural, not a feature claim.
const BOILERPLATE = new Set([
  "id", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id",
  "voided_at", "voided_by_user_id", "void_reason", "deactivated_at", "archived_at",
  "is_active", "operating_company_id", "tenant_id", "notes", "metadata",
]);

/**
 * BASELINE of pre-existing dead schema, captured 2026-07-21 by this guard's first run.
 * It is a DEBT REGISTER, not an approval: every entry is a column/table implying a feature that
 * does not exist. NEW dead schema is NOT allowed — anything not in the baseline fails the build.
 * Wire an object and DELETE its entry (the guard reports entries that became wired).
 */
const BASELINE_FILE = join(ROOT, "scripts/verify-no-dead-schema.baseline.json");
const ALLOWLIST = new Map(
  (() => {
    try {
      const b = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
      return (b.entries ?? []).map((e) => [e.object, `baseline ${b._captured} — ${e.kind} added by ${e.migration}`]);
    } catch {
      return [];
    }
  })()
);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(p) && !/\.(test|spec)\.[tj]sx?$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

/** One corpus of all non-test source, so identifier lookup is a substring test (fast). */
function buildSourceCorpus() {
  const files = SOURCE_ROOTS.flatMap((r) => walk(r));
  return files.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
}

/**
 * Strip `--` line comments and dollar-quoted bodies ($$...$$ / $tag$...$tag$).
 * Without this, semicolons INSIDE a DO block terminate the ALTER regex early and the "table"
 * capture drifts onto unrelated text (observed: "migration.test_seed_archive_ledger_0320").
 */
export function stripNoise(sql) {
  const noComments = sql.replace(/--[^\n]*/g, "");
  return noComments.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, " ");
}

/**
 * Extract objects a migration creates. Returns [{kind, key, ident}].
 * Only SCHEMA-QUALIFIED identifiers are accepted — an unqualified capture means the regex drifted,
 * and emitting it would produce a false failure (worse than no guard).
 */
export function extractCreatedObjects(rawSql) {
  const sql = stripNoise(rawSql);
  const out = [];
  const QUALIFIED = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i;

  const tableRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w.]*)/gi;
  for (const m of sql.matchAll(tableRe)) {
    const full = m[1];
    if (!QUALIFIED.test(full)) continue;
    out.push({ kind: "TABLE", key: full, ident: full.split(".").pop() });
  }

  // ALTER TABLE <schema.table> ... ADD COLUMN [IF NOT EXISTS] <col> (incl. comma-continued lists).
  const alterRe = /ALTER TABLE(?:\s+ONLY)?\s+([A-Za-z_][\w.]*)([\s\S]*?);/gi;
  for (const m of sql.matchAll(alterRe)) {
    const table = m[1];
    if (!QUALIFIED.test(table)) continue;
    const colRe = /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi;
    for (const c of m[2].matchAll(colRe)) {
      const col = c[1];
      if (BOILERPLATE.has(col)) continue;
      out.push({ kind: "COLUMN", key: `${table}.${col}`, ident: col });
    }
  }
  return out;
}

/** An identifier counts as referenced if it appears anywhere in non-test source. */
export function isReferenced(ident, corpus) {
  if (!ident || ident.length < 4) return true; // too short to match meaningfully; don't false-fail
  return corpus.includes(ident);
}

function main() {
  const corpus = buildSourceCorpus();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  const dead = [];
  const stale = new Set(ALLOWLIST.keys());

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    for (const obj of extractCreatedObjects(sql)) {
      if (isReferenced(obj.ident, corpus)) { stale.delete(obj.key); continue; }
      if (ALLOWLIST.has(obj.key)) { stale.delete(obj.key); continue; }
      dead.push({ ...obj, migration: f });
    }
  }

  if (dead.length > 0) {
    console.error("verify-no-dead-schema FAILED — schema created with NO reader (§10a linkage law):\n");
    for (const d of dead) {
      console.error(`  ${d.kind.padEnd(6)} ${d.key}`);
      console.error(`         added by ${d.migration}`);
      console.error(`         nothing in apps/backend/src or apps/frontend/src references "${d.ident}"\n`);
    }
    console.error("A column or table nothing reads is dead schema: it implies a feature that does not exist.");
    console.error("Fix it by WIRING it in the same PR (read it, reach a financial primitive, expose");
    console.error("drill-through) -- or add an ALLOWLIST entry in this file WITH A REASON if the");
    console.error("deferral is deliberate and tracked.");
    process.exit(1);
  }

  if (stale.size > 0) {
    console.log("verify-no-dead-schema: NOTE — these allowlist entries are now wired; remove them:");
    for (const k of stale) console.log(`  • ${k}`);
  }
  console.log(`verify-no-dead-schema: OK — scanned ${files.length} migrations, ${ALLOWLIST.size} known-dead allowlisted, 0 new dead objects.`);
}

function selftest() {
  const failures = [];
  const corpus = "const x = someKnownIdentifier; // referenced\n";

  const created = extractCreatedObjects(`
    CREATE TABLE IF NOT EXISTS foo.bar (id uuid);
    ALTER TABLE foo.baz ADD COLUMN IF NOT EXISTS someKnownIdentifier text,
      ADD COLUMN IF NOT EXISTS totallyUnreadColumn text,
      ADD COLUMN IF NOT EXISTS created_at timestamptz;
  `);
  if (!created.some((o) => o.kind === "TABLE" && o.key === "foo.bar")) failures.push("did not detect CREATE TABLE");
  if (!created.some((o) => o.key === "foo.baz.someKnownIdentifier")) failures.push("did not detect first ADD COLUMN");
  if (!created.some((o) => o.key === "foo.baz.totallyUnreadColumn")) failures.push("did not detect comma-continued ADD COLUMN");
  if (created.some((o) => o.key.endsWith(".created_at"))) failures.push("did not skip boilerplate column");

  if (!isReferenced("someKnownIdentifier", corpus)) failures.push("detector missed a referenced identifier");
  if (isReferenced("totallyUnreadColumn", corpus)) failures.push("detector did not flag an unreferenced identifier");

  for (const [k, reason] of ALLOWLIST) {
    if (!reason || reason.length < 10) failures.push(`allowlist entry ${k} lacks a reason`);
  }

  if (failures.length) {
    console.error("verify-no-dead-schema SELFTEST FAILED:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log("verify-no-dead-schema --selftest OK");
}

if (process.argv.includes("--selftest")) selftest();
else main();
