#!/usr/bin/env node
/**
 * verify-sql-read-targets — SCHEMA-INTEGRITY GATE for SQL READS (the read-side companion to
 * verify-sql-write-targets.mjs). The recurring class: a backend SELECT/JOIN/WHERE names a
 * schema-qualified table/column that does NOT exist in the migrated schema — surfacing only as a
 * runtime 500 (42703 undefined column / 42P01 undefined table). The two prod 500s on 2026-06-28
 * (home /role-home `bills.payment_terms_id`; compliance `mdata.equipment.operating_company_id`)
 * were READS and sailed past the write-only gate. This closes that hole at PR time.
 *
 * SCOPE (unambiguous only): inside each SQL template-literal block, build an alias map from
 * `FROM s.t alias` / `JOIN s.t alias` (schema-qualified tables only) and validate every
 * `alias.column` reference against the migrated schema. Tables in an UNTRACKED schema
 * (information_schema/pg_catalog/external) and aliases bound to CTEs/subqueries are skipped
 * (logged). Dynamic/unqualified SQL is out of scope, same honest limitation as the write gate.
 *
 * MODEL = the real migrated schema = a fresh-migrated DB's information_schema (DATABASE_URL /
 * DATABASE_DIRECT_URL). NOT the stale docs/schema-parity-baseline.json. RATCHET: a known-debt
 * allowlist (scripts/sql-read-targets-known-debt.json) that may only SHRINK; any NEW phantom read
 * fails CI. Run `--write-baseline` once to capture current debt.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "apps/backend/src");
const BASELINE = path.join(ROOT, "docs/schema-parity-baseline.json");
const DEBT_FILE = path.join(ROOT, "scripts/sql-read-targets-known-debt.json");
const WRITE_BASELINE = process.argv.includes("--write-baseline");

const fail = (lines) => { console.error("verify-sql-read-targets FAILED:"); for (const l of lines) console.error("  " + l); process.exit(1); };

// MODEL — true source is a fresh-migrated DB's information_schema (set DATABASE_URL). The
// schema-parity baseline is a FALLBACK only (its generator has blind spots, e.g. it missed mig 0392).
async function loadModel() {
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
      console.log(`verify-sql-read-targets: model = LIVE migrated DB (${Object.keys(m).length} tables).`);
      return m;
    } finally { await client.end(); }
  }
  console.log("verify-sql-read-targets: model = schema-parity baseline (FALLBACK — set DATABASE_URL for authoritative DB introspection).");
  return JSON.parse(fs.readFileSync(BASELINE, "utf8")).tables;
}

const model = await loadModel(); // { "schema.table": [cols...] }
const colSets = {};
for (const [t, cols] of Object.entries(model)) colSets[t] = new Set(cols);
const trackedSchemas = new Set(Object.keys(model).map((t) => t.split(".")[0]));

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

const QUAL = "([a-z_][a-z0-9_]*)\\.([a-z_][a-z0-9_]*)"; // schema.table → groups schema, table
// QUAL not followed by "(" → excludes set-returning function calls e.g. FROM accounting.fn_x(...)
// \b after the table forces a FULL-identifier match (no partial backtrack); (?!\s*\() excludes
// set-returning function calls e.g. FROM accounting.fn_x(...).
const ALIASED = new RegExp(`\\b(?:FROM|JOIN)\\s+${QUAL}\\b(?!\\s*\\()(?:\\s+(?:AS\\s+)?(?!ON\\b|USING\\b|WHERE\\b|LEFT\\b|RIGHT\\b|INNER\\b|JOIN\\b|GROUP\\b|ORDER\\b|LIMIT\\b|ON\\b)([a-z_][a-z0-9_]*))?`, "gi");
const COLREF = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/g;

const problems = [];
let blocks = 0, refsChecked = 0, skippedUntracked = 0;

for (const file of walk(BACKEND)) {
  const src = fs.readFileSync(file, "utf8");
  // each backtick template-literal block (SQL lives in these); no nested backticks in our SQL
  for (const blockMatch of src.matchAll(/`([^`]*)`/gs)) {
    const block = blockMatch[1];
    if (!/\b(FROM|JOIN)\b/i.test(block)) continue;
    blocks++;
    // alias map for THIS block: alias -> "schema.table" (schema-qualified, tracked tables only)
    const alias2table = {};
    for (const m of block.matchAll(ALIASED)) {
      const schema = m[1].toLowerCase(), table = m[2].toLowerCase(), alias = (m[3] || table).toLowerCase();
      const qual = `${schema}.${table}`;
      if (!trackedSchemas.has(schema)) { skippedUntracked++; continue; } // information_schema / external
      if (!colSets[qual]) {
        problems.push(`${rel(file)}: FROM/JOIN ${qual} — TABLE not in migrated schema`);
        continue;
      }
      alias2table[alias] = qual;
      alias2table[table] = qual; // also allow table-name-qualified refs
    }
    if (!Object.keys(alias2table).length) continue;
    for (const m of block.matchAll(COLREF)) {
      const alias = m[1].toLowerCase(), col = m[2].toLowerCase();
      const qual = alias2table[alias];
      if (!qual) continue; // alias not bound to a tracked schema.table (CTE/subquery/other) → skip
      if (col === "*") continue;
      refsChecked++;
      if (!colSets[qual].has(col)) {
        problems.push(`${rel(file)}: ${alias}.${col} — column "${col}" does not exist on ${qual}`);
      }
    }
  }
}

// de-dup
const uniq = [...new Set(problems)].sort();
console.log(`verify-sql-read-targets: scanned ${blocks} SQL blocks, ${refsChecked} schema-qualified column refs (${skippedUntracked} untracked-schema refs skipped).`);

if (WRITE_BASELINE) {
  fs.writeFileSync(DEBT_FILE, JSON.stringify({ note: "Known phantom READ targets (ratchet — may only shrink). Each fix removes its line. See CC-04 / docs.", debt: uniq }, null, 2) + "\n");
  console.log(`verify-sql-read-targets: wrote baseline with ${uniq.length} known-debt read target(s) → ${path.relative(ROOT, DEBT_FILE)}`);
  process.exit(0);
}

let debt = new Set();
try { debt = new Set(JSON.parse(fs.readFileSync(DEBT_FILE, "utf8")).debt); } catch { /* no allowlist → all problems are new */ }
const seen = new Set(uniq);
const newPhantoms = uniq.filter((p) => !debt.has(p));
const staleDebt = [...debt].filter((d) => !seen.has(d));

if (staleDebt.length) {
  console.log(`verify-sql-read-targets: ${staleDebt.length} known-debt entr(y/ies) are now FIXED — remove them from sql-read-targets-known-debt.json (the list must shrink):`);
  for (const d of staleDebt) console.log("  ✓ fixed: " + d);
}
if (newPhantoms.length) {
  fail([
    `${newPhantoms.length} NEW phantom read target(s) (not in the known-debt allowlist) — a SELECT/JOIN/WHERE names a table/column not in the migrated schema:`,
    ...newPhantoms,
  ]);
}
if (debt.size) {
  console.log(`verify-sql-read-targets OK — no NEW phantom reads. ${debt.size} pre-existing known-debt item(s) remain (tracked for remediation; CC-04 shrinks the list).`);
} else {
  console.log("verify-sql-read-targets OK — every schema-qualified backend read targets a real migrated table + column.");
}
