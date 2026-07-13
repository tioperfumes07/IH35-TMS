#!/usr/bin/env node
// verify-no-duplicate-financial-ledger (GUARD-NO-DUPLICATE-FINANCIAL-LEDGER)
//
// Makes it STRUCTURALLY IMPOSSIBLE to merge a NEW financial table that duplicates an existing canonical
// money ledger. Root failure it kills: a block named driver_finance.cash_advances / a second settlement
// ledger while driver_finance.driver_advances + driver_finance.driver_settlements already exist =
// split-brain money ledger. Enforced at CI, not at anyone's good intentions.
//
// HOW: scripts/canonical-ledger-registry.json maps money-concept -> THE ONE canonical table. This guard
// scans db/migrations for CREATE TABLE in a financial schema (driver_finance/accounting/banking/
// factoring/factor) OR any table whose name-token collides with a registry concept whose canonical table
// exists. Pre-existing tables are frozen in the baseline and NEVER evaluated. For each genuinely-NEW such
// table the migration MUST:
//   (a) carry an inline `-- CANONICAL-CHECK:` block (or a `-- SUPERSEDES:` line), else FAIL, AND
//   (b) for every collision, EITHER `-- SUPERSEDES: <schema.table> (JORGE-APPROVED <YYYY-MM-DD>)` (a
//       deliberate owner-gated replacement) OR a CANONICAL-CHECK block that EXPLICITLY NAMES the colliding
//       canonical table (a stated distinct rationale). A bare CANONICAL-CHECK that ignores the collision
//       still FAILS — you cannot add a colliding money table without consciously addressing the existing one.
// SERVICE soft-check: a new apps/backend/src/**/*.service.ts whose concept-token collides with an existing
//   service in the same domain -> WARN (informational; services aren't ledgers, tables are the chokepoint).
//
// Regenerate the baseline after a legitimately-reconciled new table lands: --write-baseline
// Self-test: node scripts/verify-no-duplicate-financial-ledger.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only. NO migration, NO GL, NO flag.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const REGISTRY_REL = "scripts/canonical-ledger-registry.json";
const BASELINE_REL = "scripts/verify-no-duplicate-financial-ledger.baseline.json";
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

// ───────────────────────── pure helpers (all deterministic, no I/O) ─────────────────────────

/** Singularize one lowercase word (naive but sufficient for schema identifiers). */
function singularWord(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses") || w.endsWith("ss")) return w;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Normalize a snake_case identifier to a singularized word list, e.g. "cash_advances" -> ["cash","advance"]. */
function words(name) {
  return String(name)
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(singularWord);
}

/** True iff `keyWords` appears as a contiguous run inside `nameWords`. */
function containsRun(nameWords, keyWords) {
  if (keyWords.length === 0 || keyWords.length > nameWords.length) return false;
  for (let i = 0; i + keyWords.length <= nameWords.length; i++) {
    let ok = true;
    for (let j = 0; j < keyWords.length; j++) {
      if (nameWords[i + j] !== keyWords[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function fq(schema, name) { return `${schema}.${name}`; }

/**
 * Which registry concepts does this table name collide with, and what canonical table does each point to?
 * @returns {Array<{concept:string, canonical:string}>}
 */
function conceptMatches(tableName, registry) {
  const nameWords = words(tableName);
  const out = [];
  for (const [concept, canonical] of Object.entries(registry.concepts || {})) {
    if (containsRun(nameWords, words(concept))) out.push({ concept, canonical });
  }
  return out;
}

/** Does the canonical target exist in the known table set? Handles the "schema.*" wildcard. */
function canonicalExists(canonical, tableSet, schemaSet) {
  if (canonical.endsWith(".*")) return schemaSet.has(canonical.slice(0, -2));
  return tableSet.has(canonical);
}

/** Is `canonical` a DIFFERENT ledger than table `fqName` (schema.name)? Wildcard = "outside that schema". */
function isDistinctLedger(canonical, fqName) {
  if (canonical.endsWith(".*")) {
    const wSchema = canonical.slice(0, -2);
    return fqName.split(".")[0] !== wSchema; // a matching-concept table OUTSIDE the canonical schema
  }
  return canonical !== fqName;
}

/**
 * Core evaluation — pure. Inputs are plain data so --selftest can drive it with synthetic fixtures.
 * @param {{
 *   registry: any,
 *   baseline: string[],                       // frozen fqnames, never evaluated
 *   tables: Array<{fq:string, schema:string, name:string}>,  // every CREATE TABLE currently on disk
 *   declText: Record<string,string>,          // fqname -> the comment/declaration text of its CREATE migration
 * }} args
 * @returns {{errors:string[], evaluated:string[]}}
 */
export function evaluate({ registry, baseline, tables, declText }) {
  const financial = new Set(registry.financial_schemas || []);
  const tableSet = new Set(tables.map((t) => t.fq));
  const schemaSet = new Set(tables.map((t) => t.schema));
  const baseSet = new Set(baseline || []);
  const errors = [];
  const evaluated = [];

  for (const t of tables) {
    if (baseSet.has(t.fq)) continue; // pre-existing (frozen) — never evaluated

    const matches = conceptMatches(t.name, registry);
    // collisions = matched canonical ledgers that EXIST and are a DIFFERENT table than this one
    const collisions = [
      ...new Set(
        matches
          .filter((m) => canonicalExists(m.canonical, tableSet, schemaSet) && isDistinctLedger(m.canonical, t.fq))
          .map((m) => m.canonical)
      ),
    ];

    const isFinancial = financial.has(t.schema);
    if (!isFinancial && collisions.length === 0) continue; // not a financial table and collides with nothing → ignore

    evaluated.push(t.fq);
    const text = declText[t.fq] || "";
    const hasCanonicalCheck = /--\s*CANONICAL-CHECK:/i.test(text);
    const supersedes = [...text.matchAll(/--\s*SUPERSEDES:\s*([a-z_]+\.[a-z_*]+)\s*\(JORGE-APPROVED\s*(\d{4}-\d{2}-\d{2})\)/gi)]
      .map((m) => m[1].toLowerCase());
    const hasDeclaration = hasCanonicalCheck || supersedes.length > 0;

    if (!hasDeclaration) {
      errors.push(
        `${t.fq}: NEW financial table has no '-- CANONICAL-CHECK:' block. Every new table in a financial ` +
          `schema (or one whose name collides with a canonical money-concept) must declare its money-concept ` +
          `and confirm no existing canonical ledger already covers it.`
      );
      continue;
    }

    for (const c of collisions) {
      const supersededByThis = supersedes.includes(c);
      const namedInCheck = hasCanonicalCheck && commentNames(text, c);
      if (!supersededByThis && !namedInCheck) {
        errors.push(
          `${t.fq}: COLLISION with canonical ledger '${c}'. This name duplicates an existing money ledger. ` +
            `Resolve by EITHER '-- SUPERSEDES: ${c} (JORGE-APPROVED <YYYY-MM-DD>)' (deliberate owner-gated ` +
            `replacement — then name what to deprecate) OR a '-- CANONICAL-CHECK:' block that explicitly names ` +
            `'${c}' and states why this table is distinct (a catalog, a projection, a sub-concept — not a 2nd ledger).`
        );
      }
    }
  }
  return { errors, evaluated };
}

/** True iff the comment text explicitly names the canonical table (bare name or fqname, or wildcard schema). */
function commentNames(text, canonical) {
  const lc = text.toLowerCase();
  if (canonical.endsWith(".*")) return lc.includes(canonical.slice(0, -2)); // e.g. "factoring"
  const bare = canonical.split(".")[1];
  return lc.includes(canonical) || new RegExp(`\\b${bare}\\b`).test(lc);
}

// ───────────────────────── real-repo I/O ─────────────────────────

/** Parse every CREATE TABLE across db/migrations → {fq,schema,name} + map fq→combined comment text of its file(s). */
function scanMigrations() {
  const tables = [];
  const seen = new Set();
  const declText = {};
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
    : [];
  const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    const comments = sql
      .split("\n")
      .filter((l) => l.trimStart().startsWith("--"))
      .join("\n");
    for (const m of sql.matchAll(CREATE_RE)) {
      const schema = m[1].toLowerCase();
      const name = m[2].toLowerCase();
      const key = fq(schema, name);
      if (!seen.has(key)) {
        seen.add(key);
        tables.push({ fq: key, schema, name });
      }
      // A table's declaration text = comments of EVERY migration that CREATEs it (usually one).
      declText[key] = (declText[key] ? `${declText[key]}\n` : "") + comments;
    }
  }
  return { tables, declText };
}

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return fallback; }
}

/** The set of tables that WOULD be evaluated (financial-schema OR concept-colliding) — used to build the baseline. */
function evaluableSet(tables, registry) {
  const financial = new Set(registry.financial_schemas || []);
  const tableSet = new Set(tables.map((t) => t.fq));
  const schemaSet = new Set(tables.map((t) => t.schema));
  const out = [];
  for (const t of tables) {
    const matches = conceptMatches(t.name, registry);
    const collides = matches.some(
      (m) => canonicalExists(m.canonical, tableSet, schemaSet) && isDistinctLedger(m.canonical, t.fq)
    );
    if (financial.has(t.schema) || collides) out.push(t.fq);
  }
  return out.sort();
}

function writeBaseline() {
  const registry = readJson(REGISTRY_REL, { concepts: {}, financial_schemas: [] });
  const { tables } = scanMigrations();
  const frozen = evaluableSet(tables, registry);
  const payload = {
    _doc: "Frozen set of financial/concept-colliding tables that EXISTED when the guard was introduced. " +
      "Only tables NOT in this list are evaluated by verify-no-duplicate-financial-ledger. Regenerate with " +
      "`node scripts/verify-no-duplicate-financial-ledger.mjs --write-baseline` ONLY after a legitimately-" +
      "reconciled new financial table has landed (with its CANONICAL-CHECK / SUPERSEDES).",
    frozen_tables: frozen,
  };
  fs.writeFileSync(path.join(ROOT, BASELINE_REL), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[verify-no-duplicate-financial-ledger] baseline written: ${frozen.length} frozen tables → ${BASELINE_REL}`);
}

/** Soft service-collision WARN (informational; never fails). */
function serviceWarnings(registry) {
  const warns = [];
  if (!fs.existsSync(BACKEND_SRC)) return warns;
  const services = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".service.ts")) services.push(p);
    }
  };
  walk(BACKEND_SRC);
  // group by concept; a concept mapped by >1 distinct service basename → surface it
  const byConcept = new Map();
  for (const p of services) {
    const base = path.basename(p, ".service.ts");
    for (const { concept } of conceptMatches(base.replace(/-/g, "_"), registry)) {
      if (!byConcept.has(concept)) byConcept.set(concept, new Set());
      byConcept.get(concept).add(base);
    }
  }
  for (const [concept, set] of byConcept) {
    if (set.size > 1) warns.push(`concept '${concept}' touched by ${set.size} services: ${[...set].sort().join(", ")}`);
  }
  return warns;
}

function realRun() {
  const registry = readJson(REGISTRY_REL, null);
  if (!registry) {
    console.error(`[verify-no-duplicate-financial-ledger] FAIL — cannot read ${REGISTRY_REL}`);
    process.exit(1);
  }
  const baseline = readJson(BASELINE_REL, { frozen_tables: [] }).frozen_tables || [];
  const { tables, declText } = scanMigrations();
  const { errors, evaluated } = evaluate({ registry, baseline, tables, declText });

  for (const w of serviceWarnings(registry)) console.warn(`[verify-no-duplicate-financial-ledger] WARN (service soft-check): ${w}`);

  if (errors.length) {
    console.error(`[verify-no-duplicate-financial-ledger] FAIL — ${errors.length} issue(s):`);
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  console.log(
    `[verify-no-duplicate-financial-ledger] OK — ${tables.length} tables scanned, ${baseline.length} baselined, ` +
      `${evaluated.length} new financial/colliding table(s) evaluated, 0 unresolved duplicate ledgers.`
  );
}

// ───────────────────────── selftest ─────────────────────────

function selftest() {
  const registry = readJson(REGISTRY_REL, null) || {
    financial_schemas: ["driver_finance", "accounting", "banking", "factoring", "factor"],
    concepts: {
      advance: "driver_finance.driver_advances",
      cash_advance: "driver_finance.driver_advances",
      payment_method: "driver_finance.driver_payment_methods",
      settlement: "driver_finance.driver_settlements",
    },
  };
  // synthetic "current tables" incl. the canonical ledgers (so collisions have a real target) + a baseline.
  const canon = [
    { fq: "driver_finance.driver_advances", schema: "driver_finance", name: "driver_advances" },
    { fq: "driver_finance.driver_settlements", schema: "driver_finance", name: "driver_settlements" },
    { fq: "driver_finance.driver_payment_methods", schema: "driver_finance", name: "driver_payment_methods" },
  ];
  const baseline = canon.map((t) => t.fq);

  const cases = [
    {
      label: "(i) new driver_finance.cash_advances → FAIL (collides w/ driver_advances)",
      newT: { fq: "driver_finance.cash_advances", schema: "driver_finance", name: "cash_advances" },
      text: "-- a new advance ledger with no reconciliation\nCREATE TABLE driver_finance.cash_advances (...)",
      expectFail: true,
    },
    {
      label: "(ii) same + SUPERSEDES(JORGE-APPROVED) → PASS",
      newT: { fq: "driver_finance.cash_advances", schema: "driver_finance", name: "cash_advances" },
      text: "-- SUPERSEDES: driver_finance.driver_advances (JORGE-APPROVED 2026-07-13)\nCREATE TABLE driver_finance.cash_advances (...)",
      expectFail: false,
    },
    {
      label: "(iii) new catalogs.payment_methods + CANONICAL-CHECK naming driver_payment_methods → PASS",
      newT: { fq: "catalogs.payment_methods", schema: "catalogs", name: "payment_methods" },
      text:
        "-- CANONICAL-CHECK: payment_method_catalog. The owner-editable payment-method CATALOG.\n" +
        "-- driver_finance.driver_payment_methods (the per-driver method) will FK into this catalog —\n" +
        "-- distinct concept, NOT a second per-driver ledger.\nCREATE TABLE catalogs.payment_methods (...)",
      expectFail: false,
    },
    {
      label: "(iv) new financial table with NO CANONICAL-CHECK → FAIL",
      newT: { fq: "driver_finance.driver_bonus_ledger", schema: "driver_finance", name: "driver_bonus_ledger" },
      text: "CREATE TABLE driver_finance.driver_bonus_ledger (...)",
      expectFail: true,
    },
    {
      label: "(v) a baselined existing table → not evaluated (PASS)",
      newT: null, // no new table; just the baselined canon
      text: "",
      expectFail: false,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const tables = [...canon];
    const declText = {};
    if (c.newT) { tables.push(c.newT); declText[c.newT.fq] = c.text; }
    const { errors, evaluated } = evaluate({ registry, baseline, tables, declText });
    const failed = errors.length > 0;
    const ok = failed === c.expectFail;
    // extra assertion for (v): the baselined tables must never appear in `evaluated`
    const vOk = c.newT ? true : evaluated.length === 0;
    if (ok && vOk) { pass++; console.log(`ok    ${c.label}`); }
    else console.error(`FAIL  ${c.label} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}${c.newT ? "" : ` (evaluated=${evaluated.length})`}\n      ${errors.join("\n      ")}`);
  }
  console.log(`\nverify-no-duplicate-financial-ledger SELFTEST ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

// ───────────────────────── entry ─────────────────────────

if (process.argv.includes("--write-baseline")) writeBaseline();
else if (process.argv.includes("--selftest")) selftest();
else realRun();
