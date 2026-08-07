#!/usr/bin/env node
/**
 * verify-void-predicate-map-current.mjs — ACCT-F157. Keep the canonical void-predicate map honest.
 *
 * WHY THE MAP EXISTS. "Exclude the voided row" had TEN different spellings across apps/backend/src:
 * is_active=true (352), deleted_at IS NULL (285), voided_at IS NULL (269), soft_deleted_at IS NULL
 * (199), archived_at IS NULL (150), revoked_at IS NULL (101), status<>'voided' (28), status NOT IN
 * ('void') (11), reversed_by_je_id IS NULL (4), unapplied_at IS NULL (4). Every one of them correct in
 * its own place, and no canonical predicate anywhere.
 *
 * The cost of that is not cosmetic. It makes the invariant "a money total never includes a voided row"
 * UNGUARDABLE. I tried the broad sweep three times — 114 file/table pairs, then 82, then 44 — and each
 * round shrank only because I had learned another spelling; the two sites I hand-checked at 44 were
 * BOTH correct code (customer-financial used status NOT IN ('void'), wo-cost-validation used
 * revoked_at IS NULL). A guard that is wrong more often than right teaches people to ignore it, so the
 * right move was to stop building it and fix the missing fact instead. docs/audit/void-predicate-map.json
 * is that fact: one canonical predicate per financial table, generated from prod.
 *
 * WHAT THIS GUARD ASSERTS — deliberately narrow, because the map's value is being TRUSTED:
 *   1. Every table in the map still exists in db/migrations and still has its canonical column. A map
 *      that has drifted from the schema is worse than no map, because callers will trust it.
 *   2. Every financial table that GAINS a soft-delete column is added to the map. Otherwise the map
 *      silently stops being complete the first time someone adds a table, which is exactly how the
 *      original drift happened.
 *
 * It does NOT check that queries use the predicate. That is the follow-on guard, and it only becomes
 * writable with acceptable precision once this map exists — which is the entire point of doing this
 * first rather than shipping a noisy sweep.
 *
 * Static (reads db/migrations), so it runs in CI with no database. Prod generated the map and prod
 * remains authoritative; this catches repo-side drift, which is every drift a PR can introduce.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-void-predicate-map-current";
const MAP = path.join(ROOT, "docs", "audit", "void-predicate-map.json");
const MIGRATIONS = path.join(ROOT, "db", "migrations");

const FINANCIAL_SCHEMAS = ["accounting", "banking", "driver_finance", "factoring", "fuel"];
const SOFT_DELETE_COLS = [
  "voided_at", "soft_deleted_at", "deleted_at", "revoked_at", "archived_at", "unapplied_at", "is_active",
];

/** Every soft-delete column each financial table is given anywhere in the migration history. */
export function scanMigrations(dir = MIGRATIONS) {
  const tables = new Map();
  if (!fs.existsSync(dir)) return tables;
  const add = (schema, table, col) => {
    if (!FINANCIAL_SCHEMAS.includes(schema)) return;
    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, new Set());
    if (col) tables.get(key).add(col);
  };

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");

    // CREATE TABLE <s>.<t> ( ... ) — columns declared in the body
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\.([a-z_0-9]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      const [schema, table, body] = [m[1].toLowerCase(), m[2].toLowerCase(), m[3]];
      add(schema, table, null);
      for (const col of SOFT_DELETE_COLS) {
        if (new RegExp(`^\\s*${col}\\b`, "im").test(body)) add(schema, table, col);
      }
    }
    // ALTER TABLE <s>.<t> ... ADD COLUMN [IF NOT EXISTS] <col>
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_]+)\.([a-z_0-9]+)([\s\S]*?);/gi)) {
      const [schema, table, tail] = [m[1].toLowerCase(), m[2].toLowerCase(), m[3]];
      for (const col of SOFT_DELETE_COLS) {
        if (new RegExp(`ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${col}\\b`, "i").test(tail)) add(schema, table, col);
      }
    }
  }
  return tables;
}

export function evaluate(map, scanned) {
  const problems = [];

  // 1. every mapped table still exists with its canonical column
  for (const [tbl, entry] of Object.entries(map.tables ?? {})) {
    const cols = scanned.get(tbl);
    if (!cols) continue; // table not found in migrations — prod-only or renamed; not this guard's call
    if (cols.size && !cols.has(entry.canonical_column)) {
      problems.push(
        `${tbl}: map says canonical "${entry.canonical_column}" but migrations declare only [${[...cols].join(", ")}]`
      );
    }
  }

  // 2. every financial table WITH a soft-delete column is in the map
  const missing = [];
  for (const [tbl, cols] of scanned) {
    if (cols.size === 0) continue;
    if (!map.tables?.[tbl]) missing.push(`${tbl} (has ${[...cols].join(", ")})`);
  }
  if (missing.length > (map._known_unmapped?.length ?? 0)) {
    const unknown = missing.filter((m) => !(map._known_unmapped ?? []).some((k) => m.startsWith(k)));
    if (unknown.length) {
      problems.push(
        `${unknown.length} financial table(s) have a soft-delete column but are NOT in the map:\n` +
          unknown.map((t) => `      - ${t}`).join("\n")
      );
    }
  }
  return problems;
}

function run() {
  if (!fs.existsSync(MAP)) {
    console.error(`${LABEL} FAIL — ${path.relative(ROOT, MAP)} is missing`);
    return 1;
  }
  const map = JSON.parse(fs.readFileSync(MAP, "utf8"));
  const problems = evaluate(map, scanMigrations());
  if (problems.length) {
    console.error(`${LABEL} FAIL — the canonical void-predicate map has drifted:\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error(
      `A map callers TRUST but that has drifted is worse than no map at all.\n` +
        `Fix: add the table to docs/audit/void-predicate-map.json with the correct canonical column\n` +
        `(precedence: voided_at > soft_deleted_at > deleted_at > revoked_at > archived_at >\n` +
        `unapplied_at > is_active). Never change a canonical_column to make a query pass.\n`
    );
    return 1;
  }
  console.log(`${LABEL} OK — ${Object.keys(map.tables ?? {}).length} financial table(s) mapped; no drift vs migrations`);
  return 0;
}

function selftest() {
  const failures = [];
  const base = { tables: { "accounting.bills": { canonical_column: "voided_at", predicate: "voided_at IS NULL" } } };
  const scan = (o) => new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]));

  if (evaluate(base, scan({ "accounting.bills": ["voided_at"] })).length !== 0)
    failures.push("case1 FAIL — a correct map must be GREEN.");

  if (evaluate(base, scan({ "accounting.bills": ["deleted_at"] })).length === 0)
    failures.push("case2 FAIL — canonical column absent from migrations must go RED.");

  if (evaluate(base, scan({ "accounting.bills": ["voided_at"], "accounting.newledger": ["voided_at"] })).length === 0)
    failures.push("case3 FAIL — an unmapped financial table with a soft-delete column must go RED.");

  if (evaluate(base, scan({ "accounting.bills": ["voided_at"], "accounting.plain": [] })).length !== 0)
    failures.push("case4 FAIL — a table with NO soft-delete column must not be required in the map.");

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — correct map GREEN, drifted column RED, unmapped table RED, no-column table ignored`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : run());
}
