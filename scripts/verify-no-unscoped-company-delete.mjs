#!/usr/bin/env node
// NO-UNSCOPED-COMPANY-DELETE GUARD — ROUND E11.3-R item 5 (owner order), the guard that stops the
// AUTH-001 class of bug permanently, not just this one instance of it.
//
// ROOT CAUSE (confirmed live, this round): the wipe's DELETE FROM mdata.load_stops carried no
// operating_company_id predicate at all (measured: the table is now globally empty -- USMCA's 277
// rows AND the frozen TRANSP entity's 10 rows, across 5 loads, both gone -- a properly scoped
// `WHERE load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id=$1)` would have left
// every other entity's stops untouched). mdata.load_stops carries no operating_company_id column
// of its own, so a correct delete against it MUST join to a parent table that does.
//
// SCOPE: db/migrations/**/*.sql and scripts/ops/**/*.{mjs,ts} -- the two places a real DELETE
// against a live, company-scoped table can originate (a migration, or a one-shot ops script).
// Application route/service code is NOT scanned here -- that surface already has RLS as a backstop
// (`app.bypass_rls` is required to defeat it, and every bypass call site is its own, separately
// guarded, reviewed surface) and is a different, much larger scan this guard does not attempt.
//
// WHICH TABLES ARE GOVERNED: built by scanning db/migrations/**/*.sql for CREATE TABLE / ALTER
// TABLE ... ADD COLUMN statements naming operating_company_id -- self-updating, never a hand-typed
// list that drifts (the exact failure class documented in this repo's own memory of stale
// baselines). PLUS three tables named explicitly because they do NOT carry the column and must be
// scoped by joining to a parent that does: accounting.company_settlement_driver_settlements,
// expense_attribution.expense_seq_per_load, mdata.load_stops.
//
// THE CHECK, uniform across both groups: every DELETE FROM <governed table> statement's own text
// (from DELETE FROM up to its terminating semicolon) must contain the literal string
// "operating_company_id" somewhere -- whether as its own WHERE predicate (governed-by-column
// tables) or via a join/subquery to a scoped parent (the three named exceptions). A DELETE with no
// mention of operating_company_id anywhere in its body is exactly the AUTH-001 shape: nothing
// stops it from deleting every row in the table, in every entity, at once.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-unscoped-company-delete";

export const WITHOUT_OWN_COLUMN_MUST_JOIN_PARENT = [
  "accounting.company_settlement_driver_settlements",
  "expense_attribution.expense_seq_per_load",
  "mdata.load_stops",
];

/** Same convention as scripts/lib/migration-content-verifier.mjs's own stripComments — block
 *  comments first (so a `--` inside one isn't treated as a line comment start), then line
 *  comments. Without this, a commented-out example DELETE (`-- WHERE ...`) in a migration's own
 *  explanatory comment reads as a live, unscoped statement — a real false positive measured live
 *  against this repo before this fix (catalogs.accounts, lib.feature_flag_overrides, and others). */
function stripSqlComments(sql) {
  const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlock
    .split("\n")
    .map((line) => line.replace(/--.*$/g, " "))
    .join("\n");
}

const CREATE_TABLE_RE = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z0-9_]+\.[a-z0-9_]+)\s*\(([^;]*?)\)\s*;/gis;
const ALTER_ADD_COLUMN_RE = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+ONLY\s+([a-z0-9_]+\.[a-z0-9_]+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+operating_company_id\b/gis;
const ALTER_ADD_COLUMN_RE2 = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-z0-9_]+\.[a-z0-9_]+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+operating_company_id\b/gis;
const DELETE_STATEMENT_RE = /DELETE\s+FROM\s+([a-z0-9_]+\.[a-z0-9_]+)\b([\s\S]*?);/gi;

function walk(dir, filterRe, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, filterRe, out);
    else if (filterRe.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Scan migration SQL text for tables that carry operating_company_id, from either a CREATE TABLE
 * or a later ALTER TABLE ADD COLUMN. Pure string function — no filesystem — so it is directly
 * unit-testable.
 * @param {Array<{ path: string, text: string }>} migrationFiles
 * @returns {Set<string>} lower-cased schema.table names known to carry operating_company_id
 */
export function buildCompanyScopedTableRegistry(migrationFiles) {
  const registry = new Set();
  for (const { text: rawText } of migrationFiles) {
    const text = stripSqlComments(rawText);
    for (const m of text.matchAll(CREATE_TABLE_RE)) {
      const [, table, body] = m;
      if (/\boperating_company_id\b/i.test(body)) registry.add(table.toLowerCase());
    }
    for (const m of text.matchAll(ALTER_ADD_COLUMN_RE)) registry.add(m[1].toLowerCase());
    for (const m of text.matchAll(ALTER_ADD_COLUMN_RE2)) registry.add(m[1].toLowerCase());
  }
  return registry;
}

/**
 * Find every DELETE statement in a file's text and report which ones are unscoped, given the
 * registry of company-scoped tables and the fixed without-own-column list. Pure — no filesystem.
 * @param {string} text
 * @param {Set<string>} scopedRegistry
 * @returns {Array<{ table: string, statement: string }>} the offending DELETEs, if any
 */
export function findUnscopedDeletes(rawText, scopedRegistry) {
  const text = stripSqlComments(rawText);
  const offenders = [];
  for (const m of text.matchAll(DELETE_STATEMENT_RE)) {
    const table = m[1].toLowerCase();
    const isGoverned = scopedRegistry.has(table) || WITHOUT_OWN_COLUMN_MUST_JOIN_PARENT.includes(table);
    if (!isGoverned) continue;
    const statement = m[0];
    if (!/operating_company_id/i.test(statement)) {
      offenders.push({ table, statement: statement.trim().slice(0, 300) });
    }
  }
  return offenders;
}

function scanRepo() {
  const migrationFiles = walk(path.join(ROOT, "db/migrations"), /\.sql$/).map((p) => ({
    path: p,
    text: fs.readFileSync(p, "utf8"),
  }));
  const registry = buildCompanyScopedTableRegistry(migrationFiles);

  const targets = [
    ...walk(path.join(ROOT, "db/migrations"), /\.sql$/),
    ...walk(path.join(ROOT, "scripts/ops"), /\.(mjs|ts)$/),
  ];

  const allOffenders = [];
  for (const file of targets) {
    const text = fs.readFileSync(file, "utf8");
    const offenders = findUnscopedDeletes(text, registry);
    for (const o of offenders) allOffenders.push({ file: path.relative(ROOT, file), ...o });
  }
  return { registry, allOffenders };
}

function selfTest() {
  let failed = 0;
  const check = (name, cond) => {
    console.log(`${cond ? "ok  " : "FAIL"}  ${name}`);
    if (!cond) failed++;
  };

  // ── registry building ──
  const fixtureMigrations = [
    { path: "0001_x.sql", text: `CREATE TABLE mdata.loads (id uuid, operating_company_id uuid NOT NULL, load_number text);` },
    { path: "0002_x.sql", text: `ALTER TABLE accounting.expenses ADD COLUMN operating_company_id uuid;` },
    { path: "0003_x.sql", text: `CREATE TABLE mdata.load_stops (id uuid, load_id uuid);` }, // genuinely no oci column
  ];
  const registry = buildCompanyScopedTableRegistry(fixtureMigrations);
  check("CREATE TABLE with operating_company_id registers", registry.has("mdata.loads"));
  check("ALTER TABLE ADD COLUMN operating_company_id registers", registry.has("accounting.expenses"));
  check("table genuinely without the column does NOT register", !registry.has("mdata.load_stops"));

  // ── RED: the exact AUTH-001 shape, reconstructed from the live evidence (a bare, unconditional
  // DELETE with zero operating_company_id mention is the only shape consistent with the measured
  // outcome: mdata.load_stops went to GLOBAL zero, not just USMCA's 277 of 287 rows) ──
  const redFixture = `DELETE FROM mdata.load_stops;`;
  const redOffenders = findUnscopedDeletes(redFixture, registry);
  check("RED — bare unscoped DELETE FROM mdata.load_stops is FLAGGED", redOffenders.length === 1 && redOffenders[0].table === "mdata.load_stops");
  console.log(`  RED statement: ${redFixture}`);
  console.log(`  RED result: ${redOffenders.length} offender(s) — ${JSON.stringify(redOffenders)}`);

  // ── GREEN: the fix — join to the parent that carries operating_company_id ──
  const greenFixture = `DELETE FROM mdata.load_stops WHERE load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = $1::uuid);`;
  const greenOffenders = findUnscopedDeletes(greenFixture, registry);
  check("GREEN — DELETE scoped via JOIN to a parent carrying operating_company_id PASSES", greenOffenders.length === 0);
  console.log(`  GREEN statement: ${greenFixture}`);
  console.log(`  GREEN result: ${greenOffenders.length} offender(s)`);

  // ── a governed-by-own-column table, unscoped, must also be flagged ──
  const ociTableUnscoped = `DELETE FROM accounting.expenses;`;
  check("own-column table, bare DELETE -> FLAGGED", findUnscopedDeletes(ociTableUnscoped, registry).length === 1);
  const ociTableScoped = `DELETE FROM accounting.expenses WHERE operating_company_id = $1::uuid;`;
  check("own-column table, scoped DELETE -> PASSES", findUnscopedDeletes(ociTableScoped, registry).length === 0);

  // ── an ungoverned table (never mentioned as company-scoped anywhere) is out of scope, not a
  // false positive ──
  const ungoverned = `DELETE FROM catalogs.some_lookup_table;`;
  check("ungoverned table -> not flagged (out of scope, not silently \"passed\")", findUnscopedDeletes(ungoverned, registry).length === 0);

  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed} check(s)`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

const BASELINE_PATH = path.join(ROOT, "scripts/verify-no-unscoped-company-delete.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return new Set();
  const json = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  return new Set(json.keys ?? []);
}

function offenderKey(o) {
  return `${o.file}|${o.table}`;
}

function main() {
  if (process.argv.includes("--selftest")) {
    selfTest();
    return;
  }
  const { allOffenders } = scanRepo();
  const baseline = loadBaseline();
  const fresh = allOffenders.filter((o) => !baseline.has(offenderKey(o)));

  if (fresh.length) {
    console.error(`${LABEL} FAIL — ${fresh.length} NEW unscoped DELETE(s) against a company-scoped table (beyond the ${baseline.size}-entry baseline):`);
    for (const o of fresh) {
      console.error(`  ✗ ${o.file}: DELETE FROM ${o.table} — no operating_company_id anywhere in the statement`);
      console.error(`      ${o.statement}`);
    }
    console.error(
      `\nEvery DELETE against a governed table must scope via its own operating_company_id column, or (for ` +
      `${WITHOUT_OWN_COLUMN_MUST_JOIN_PARENT.join(", ")}) by joining to a parent table that has one. This is ` +
      `exactly the AUTH-001 wipe's own defect class — a bare DELETE FROM mdata.load_stops with no scoping at ` +
      `all deleted the frozen TRANSP entity's rows alongside USMCA's. NEW unscoped DELETEs are never baselined ` +
      `— fix the statement, don't add it to scripts/verify-no-unscoped-company-delete.baseline.json.`
    );
    process.exit(1);
  }
  const nowClean = [...baseline].filter((k) => !allOffenders.some((o) => offenderKey(o) === k));
  if (nowClean.length) {
    console.log(`${LABEL}: ${nowClean.length} baselined offender(s) no longer present — shrink the baseline: ${nowClean.join("; ")}`);
  }
  console.log(`${LABEL} OK — 0 new unscoped DELETE(s) (${allOffenders.length} pre-existing, frozen-migration entries all in the ${baseline.size}-entry baseline).`);
}

main();
