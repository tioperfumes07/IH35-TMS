#!/usr/bin/env node
/**
 * verify-sql-write-targets — SCHEMA-INTEGRITY GATE for posting/writes (the "wrong table/column" fix).
 *
 * WHY: the recurring class is code that writes (INSERT/UPDATE) to a table/column that does NOT exist in the
 * migrated schema — it only surfaces as a runtime 500 (42703 undefined column / 42P01 undefined table).
 * The older verify-backend-column-references guard only scanned identity+auth, so dispatch/accounting/
 * banking/driver-finance/payroll writes (incl. GL posting) were unguarded. This audits EVERY schema-qualified
 * `INSERT INTO s.t (cols…)` and `UPDATE s.t SET col=…` across the WHOLE backend against the authoritative
 * migrated schema (docs/schema-parity-baseline.json — the same model CI keeps in sync via verify-schema-parity)
 * and FAILS on any phantom table or column. Posting can no longer target a column that isn't really there.
 *
 * Scope = schema-qualified writes only (s.t) — unambiguous (the statement names its table + lists its columns;
 * no alias resolution needed). Unqualified writes, temp tables, and dynamic EXECUTE are out of scope (logged).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Test-only overrides (same pattern as verify-phantom-relations' PHANTOM_SCAN_DIR): let the unit test
// point the scanner/model/allowlist at fixtures without a DB. Production runs set none of these.
const BACKEND = process.env.WRITE_TARGETS_SCAN_DIR
  ? path.resolve(process.cwd(), process.env.WRITE_TARGETS_SCAN_DIR)
  : path.join(ROOT, "apps/backend/src");
const BASELINE = path.join(ROOT, "docs/schema-parity-baseline.json");

const fail = (lines) => { console.error("verify-sql-write-targets FAILED:"); for (const l of lines) console.error("  " + l); process.exit(1); };

// MODEL = the real migrated schema. TRUE source = a fresh-migrated DB's information_schema (DATABASE_URL,
// set in CI's from-migrations gate). The schema-parity-baseline.json is a FALLBACK only — its generator has
// blind spots (e.g. it missed migration 0392's CREATE TABLE/ADD COLUMN), so DB introspection is authoritative.
async function loadModel() {
  // Test-only: a fixture model JSON ({ "schema.table": ["col",...] }) is treated as the authoritative
  // LIVE model so the unit test can exercise the stale-FAIL path without a database.
  if (process.env.WRITE_TARGETS_MODEL_JSON) {
    const tables = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), process.env.WRITE_TARGETS_MODEL_JSON), "utf8"));
    console.log(`verify-sql-write-targets: model = TEST fixture (${Object.keys(tables).length} tables).`);
    return { tables, isLive: true };
  }
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (cs) {
    const pg = (await import("pg")).default;
    const { buildPgClientConfig } = await import("./lib/pg-connection-options.cjs");
    const client = new pg.Client(buildPgClientConfig(cs));
    await client.connect();
    try {
      const { rows } = await client.query(
        `SELECT table_schema || '.' || table_name AS t, column_name AS c
           FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog','information_schema')`
      );
      const m = {};
      for (const r of rows) (m[r.t] ??= []).push(r.c);
      console.log(`verify-sql-write-targets: model = LIVE migrated DB (${Object.keys(m).length} tables).`);
      return { tables: m, isLive: true };
    } finally { await client.end(); }
  }
  console.log("verify-sql-write-targets: model = schema-parity baseline (FALLBACK — set DATABASE_URL for authoritative DB introspection).");
  return { tables: JSON.parse(fs.readFileSync(BASELINE, "utf8")).tables, isLive: false };
}

// MODEL_IS_LIVE: stale-debt enforcement (CODER-28A) is only authoritative against the LIVE migrated
// DB. The FALLBACK baseline model is column-incomplete, so it would falsely mark real debt as "stale"
// — we only WARN there, and only FAIL on stale when the live model proves an entry is truly resolved.
const { tables: model, isLive: MODEL_IS_LIVE } = await loadModel(); // { "schema.table": [cols...] }
const trackedSchemas = new Set(Object.keys(model).map((t) => t.split(".")[0]));

// Known out-of-scope write targets (temp tables, dynamic, or intentionally-not-baseline). Keep TINY + justified.
const IGNORE_TABLES = new Set([
  // AF-1 builds session TEMP tables (_af1_owners/_af1_map) — not persistent schema.
]);
const isIgnorable = (t) =>
  IGNORE_TABLES.has(t) ||
  t.startsWith("_af1_") ||
  /^pg_temp/.test(t) ||
  !trackedSchemas.has(t.split(".")[0]); // schema the baseline doesn't track (e.g. a view-only or external schema)

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name) && !/__tests__/.test(full)) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const stripLineComments = (s) => s.replace(/^\s*\/\/.*$/gm, "");

const QUAL = "[a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*"; // schema.table
const problems = [];
let inserts = 0, updates = 0;

for (const file of walk(BACKEND)) {
  const src = stripLineComments(fs.readFileSync(file, "utf8"));

  // INSERT INTO schema.table (col, col, ...)
  const insRe = new RegExp(`INSERT\\s+INTO\\s+(${QUAL})\\s*\\(([^)]*)\\)`, "gis");
  for (const m of src.matchAll(insRe)) {
    const table = m[1].toLowerCase();
    if (isIgnorable(table)) continue;
    inserts++;
    const cols = model[table];
    if (!cols) { problems.push(`${rel(file)}: INSERT INTO ${table} — TABLE not in migrated schema`); continue; }
    const colSet = new Set(cols);
    for (const raw of m[2].split(",")) {
      const c = raw.trim().replace(/"/g, "").toLowerCase();
      if (!c || !/^[a-z_][a-z0-9_]*$/.test(c)) continue; // skip exprs / non-identifiers
      if (!colSet.has(c)) problems.push(`${rel(file)}: INSERT INTO ${table} — column "${c}" does not exist`);
    }
  }

  // UPDATE schema.table [AS alias | alias] SET col = ..., col = ...
  const updRe = new RegExp(`UPDATE\\s+(${QUAL})(?:\\s+(?:AS\\s+)?[a-z_][a-z0-9_]*)?\\s+SET\\s+([\\s\\S]*?)(?:\\sWHERE\\s|\\sRETURNING\\s|\\sFROM\\s|;|\`)`, "gis");
  for (const m of src.matchAll(updRe)) {
    const table = m[1].toLowerCase();
    if (isIgnorable(table)) continue;
    updates++;
    const cols = model[table];
    if (!cols) { problems.push(`${rel(file)}: UPDATE ${table} — TABLE not in migrated schema`); continue; }
    const colSet = new Set(cols);
    // SET body: pull each `col =` assignment target (the identifier immediately before an `=` at top level).
    for (const am of m[2].matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=(?!=)/gi)) {
      const c = am[1].trim().toLowerCase();
      if (!colSet.has(c)) problems.push(`${rel(file)}: UPDATE ${table} — SET column "${c}" does not exist`);
    }
  }
}

console.log(`verify-sql-write-targets: scanned ${inserts} INSERT + ${updates} UPDATE schema-qualified write targets across the backend.`);

// RATCHET: a known-debt allowlist (the 2026-06-28 audit) may only SHRINK. NEW phantom writes fail the gate;
// fixing a known one (so it no longer appears) is required to remove its allowlist line. This locks the door
// against future drift immediately while the pre-existing debt is remediated.
const DEBT_FILE = process.env.WRITE_TARGETS_DEBT_FILE
  ? path.resolve(process.cwd(), process.env.WRITE_TARGETS_DEBT_FILE)
  : path.join(ROOT, "scripts/sql-write-targets-known-debt.json");
let debt = new Set();
try { debt = new Set(JSON.parse(fs.readFileSync(DEBT_FILE, "utf8")).debt); } catch { /* no allowlist → all problems are new */ }

const seen = new Set(problems);
const newPhantoms = problems.filter((p) => !debt.has(p));
const staleDebt = [...debt].filter((d) => !seen.has(d)); // allowlisted but no longer found → should be removed

if (staleDebt.length && MODEL_IS_LIVE) {
  // Self-cleaning ratchet: against the authoritative live model, an allowlist line whose phantom
  // write no longer exists is FIXED — it must be removed so the list only ever shrinks.
  fail([
    `${staleDebt.length} STALE known-debt entr(y/ies) — the code no longer makes these phantom writes; remove them from sql-write-targets-known-debt.json (the ratchet is shrink-only):`,
    ...staleDebt.map((d) => "stale (remove me): " + d),
  ]);
}
if (staleDebt.length && !MODEL_IS_LIVE) {
  console.log(`verify-sql-write-targets: ${staleDebt.length} possibly-stale known-debt entr(y/ies) (FALLBACK model — not enforced; re-run with DATABASE_URL to confirm + remove).`);
  for (const d of staleDebt) console.log("  ? possibly-fixed: " + d);
}
if (newPhantoms.length) {
  fail([
    `${newPhantoms.length} NEW phantom write target(s) (not in the known-debt allowlist) — a write targets a table/column not in the migrated schema:`,
    ...newPhantoms,
  ]);
}
if (debt.size) {
  console.log(`verify-sql-write-targets OK — no NEW phantom writes. ${debt.size} pre-existing known-debt item(s) remain (tracked for remediation; see docs/specs/SCHEMA-WRITE-INTEGRITY-AUDIT-2026-06-28.md).`);
} else {
  console.log("verify-sql-write-targets OK — every backend INSERT/UPDATE targets a real migrated table + column.");
}
