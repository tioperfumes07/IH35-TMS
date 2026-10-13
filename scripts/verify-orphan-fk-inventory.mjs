#!/usr/bin/env node
// verify-orphan-fk-inventory (0519-ri1(a) — DB-integrity hardening, NON-FINANCIAL inventory ratchet)
//
// Referential-integrity gap census. The 0519 audit flagged ~689 `*_id`/`*_uuid` columns declared with
// NO foreign-key constraint — a silent-orphan / cross-tenant-leak surface. Adding the actual FK
// constraints is financial-cluster schema work (owner-gated migrations, per db-integrity-hardening-0519).
// This guard is the buildable NON-FINANCIAL half: a static, informational INVENTORY over db/migrations/
// of every `*_id`/`*_uuid` column defined WITHOUT an inline `REFERENCES`, baselined so today stays green.
//
// It is a RATCHET, not a schema change: the current inventory is frozen in the checked-in baseline; the
// guard FAILS only when a NEW migration introduces an `*_id`/`*_uuid` column with no inline FK that is not
// already baselined — prompting the author to add the FK (preferred) or consciously baseline it.
//
// LIMITATION (documented, acceptable for an informational ratchet): only INLINE `REFERENCES` in the same
// column definition is recognized. A column whose FK is added by a separate `ALTER TABLE ... ADD
// CONSTRAINT ... FOREIGN KEY`, or a scope column that legitimately has no FK (operating_company_id,
// tenant_id, external qbo/realm ids), is captured in the baseline as "no inline FK" — that is expected;
// the value is catching NEWLY-introduced orphan columns, not asserting every entry is a true defect.
//
// Regenerate intentionally: UPDATE_ORPHAN_FK_BASELINE=1 node scripts/verify-orphan-fk-inventory.mjs
// Self-test: node scripts/verify-orphan-fk-inventory.mjs --selftest
// LINKAGE: N/A (integrity inventory infra). Additive-only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "db/migrations");
const BASELINE = path.join(__dirname, "verify-orphan-fk-inventory.baseline.json");
const NON_FK = path.join(__dirname, "verify-orphan-fk-inventory.non-fk-columns.json");

/**
 * 443.101: kinds of *_id column that genuinely cannot take a foreign key. Each kind is NAME-CHECKED so the register
 * cannot be used to wave through a real reference column (a uuid pointing at one of our own tables is never one of these).
 */
const NON_FK_KINDS = {
  external_id: /^(samsara_[a-z_]+|google_place_id|observation_id|faro_entry_id|qbo_[a-z_]+|realm_id)$/,
  display_label: /(^|_)display_id$/,
  authorization_code: /^auth_id$/,
  tombstone_id: /^merged_[a-z_]+_id$/,
  polymorphic: /^(source_id|subject_id|source_transaction_id|source_transaction_line_id|(from|to)_entity_uuid)$/,
};

/** Validate the non-FK register against the raw inventory; returns { exempt:Set, problems:[] }. */
export function checkNonFkRegister(register, rawKeys, readMigration) {
  const problems = [];
  const exempt = new Set();
  const raw = new Set(rawKeys);
  for (const [key, e] of Object.entries(register ?? {})) {
    const col = key.split("::")[1]?.replace(/#\d+$/, "") ?? "";
    const kindRe = NON_FK_KINDS[e?.kind];
    if (!kindRe) { problems.push(`non-FK register ${key}: unknown kind "${e?.kind}"`); continue; }
    if (!kindRe.test(col)) { problems.push(`non-FK register ${key}: column "${col}" is not a ${e.kind} — a reference to our own row needs a FOREIGN KEY`); continue; }
    if (typeof e.reason !== "string" || e.reason.trim().length < 30) { problems.push(`non-FK register ${key}: needs a reason (>= 30 chars)`); continue; }
    if (e.kind === "polymorphic") {
      const sql = readMigration(key.split("::")[0]) ?? "";
      if (!e.type_column || !new RegExp(`\\b${e.type_column}\\b`).test(sql)) { problems.push(`non-FK register ${key}: polymorphic needs a type_column present in its migration`); continue; }
    }
    if (!raw.has(key)) { problems.push(`non-FK register ${key}: stale — the column no longer appears without an FK; remove the entry (shrink-only)`); continue; }
    exempt.add(key);
  }
  return { exempt, problems };
}

function loadNonFk() {
  try { return JSON.parse(fs.readFileSync(NON_FK, "utf8")).columns ?? {}; } catch { return {}; }
}

const TYPE = "(?:uuid|bigint|int8|integer|int4|int|smallint|int2|text|varchar[^,]*|char[^,]*|citext|numeric)";
const COL_RE = new RegExp(`^"?([a-z][a-z0-9_]*_(?:id|uuid))"?\\s+${TYPE}\\b`, "i");
const ADDCOL_RE = new RegExp(
  `ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?([a-z][a-z0-9_]*_(?:id|uuid))"?\\s+${TYPE}\\b`,
  "i",
);

/** Strip `--` line comments (keeps string contents naive but migrations don't embed `--` in FK defs). */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/** Split a parenthesized column list on TOP-LEVEL commas (depth 0), so multi-line column defs stay whole. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Extract the body between the FIRST top-level `(` and its matching `)`. */
function tableBody(stmt) {
  const open = stmt.indexOf("(");
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < stmt.length; i += 1) {
    if (stmt[i] === "(") depth += 1;
    else if (stmt[i] === ")") {
      depth -= 1;
      if (depth === 0) return stmt.slice(open + 1, i);
    }
  }
  return null;
}

const SKIP_PART = /^\s*(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i;

/** Collect orphan-FK column occurrences (keyed) from one migration file. */
export function scanSql(sql, basename, { withTables = false } = {}) {
  const clean = stripComments(sql);
  const found = [];
  const tables = [];
  const statements = clean.split(";");
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (/^CREATE\s+TABLE/i.test(trimmed)) {
      const body = tableBody(trimmed);
      if (!body) continue;
      for (const part of splitTopLevel(body)) {
        const p = part.trim();
        if (!p || SKIP_PART.test(p)) continue;
        const m = COL_RE.exec(p);
        if (m && !/\bREFERENCES\b/i.test(p)) { found.push(m[1].toLowerCase()); tables.push(tableName(trimmed, "CREATE")); }
      }
    } else if (/^ALTER\s+TABLE/i.test(trimmed)) {
      // Handle one-or-more ADD COLUMN clauses; only the inline def of that column is examined.
      let m;
      ADDCOL_RE.lastIndex = 0;
      const re = new RegExp(ADDCOL_RE.source, "ig");
      while ((m = re.exec(trimmed)) !== null) {
        const start = m.index;
        const rest = trimmed.slice(start, start + 220);
        const window = rest.split(/,\s*ADD\b/i)[0];
        if (!/\bREFERENCES\b/i.test(window)) { found.push(m[1].toLowerCase()); tables.push(tableName(trimmed, "ALTER")); }
      }
    }
  }
  // Key by basename + column + per-file occurrence index (migrations are immutable, so keys are stable).
  const counts = new Map();
  return found.map((col, i) => {
    const n = (counts.get(col) ?? 0) + 1;
    counts.set(col, n);
    const key = `${basename}::${col}${n > 1 ? `#${n}` : ""}`;
    return withTables ? { key, table: tables[i], col } : key;
  });
}

/** Normalised table name of a CREATE TABLE / ALTER TABLE statement ("schema.table", quotes and ONLY / IF [NOT] EXISTS dropped). */
function tableName(stmt, kind) {
  const re = kind === "CREATE"
    ? /CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/i
    : /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)/i;
  const m = re.exec(stmt);
  return m ? m[1].replaceAll('"', "").toLowerCase() : null;
}

/**
 * 443.101: every (table, column) covered by a FOREIGN KEY declared OUTSIDE the column definition — a table-level
 * `FOREIGN KEY (...)` inside CREATE TABLE, or `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (...)` in any migration
 * (including inside a DO block). Composite same-entity FKs cover each of their columns. Before this the guard saw
 * only inline REFERENCES and reported real, enforced FKs as orphans.
 */
export function separateFkColumns(sql) {
  const clean = stripComments(sql);
  const covered = new Set();
  for (const stmt of clean.split(";")) {
    const create = /CREATE\s+(?:UNLOGGED\s+)?TABLE/i.test(stmt) ? tableName(stmt, "CREATE") : null;
    const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)/gi;
    let am;
    const alters = [];
    while ((am = alterRe.exec(stmt)) !== null) alters.push({ at: am.index, table: am[1].replaceAll('"', "").toLowerCase() });
    const fkRe = /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\b/gi;
    let fm;
    while ((fm = fkRe.exec(stmt)) !== null) {
      const owner = [...alters].reverse().find((a) => a.at < fm.index)?.table ?? create;
      if (!owner) continue;
      for (const c of fm[1].split(",")) covered.add(`${owner}.${c.trim().replaceAll('"', "").toLowerCase()}`);
    }
  }
  return covered;
}

export function computeInventory() {
  const found = [];
  const covered = new Set();
  if (fs.existsSync(MIGRATIONS)) {
    for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
      found.push(...scanSql(sql, f, { withTables: true }));
      for (const c of separateFkColumns(sql)) covered.add(c);
    }
  }
  return found.filter((r) => !(r.table && covered.has(`${r.table}.${r.col}`))).map((r) => r.key).sort();
}

function loadBaseline() {
  try {
    return new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).keys);
  } catch {
    return null;
  }
}

export function run() {
  const inventory = computeInventory();
  const baseline = loadBaseline();
  if (!baseline) return [`baseline missing (${path.relative(ROOT, BASELINE)}); run UPDATE_ORPHAN_FK_BASELINE=1`];
  const readMigration = (f) => { try { return fs.readFileSync(path.join(MIGRATIONS, f), "utf8"); } catch { return null; } };
  const { exempt, problems } = checkNonFkRegister(loadNonFk(), inventory.filter((k) => !baseline.has(k)), readMigration);
  return [
    ...problems,
    ...inventory.filter((k) => !baseline.has(k) && !exempt.has(k)).map((k) => `new orphan-FK column (no FOREIGN KEY anywhere): ${k}`),
  ];
}

if (process.argv.includes("--selftest")) {
  const sql = `
    CREATE TABLE x.a (
      id uuid PRIMARY KEY,
      vendor_id uuid REFERENCES mdata.vendors(id),
      customer_id uuid NOT NULL,
      note text
    );
    ALTER TABLE x.a ADD COLUMN driver_id uuid;
    ALTER TABLE x.a ADD COLUMN linked_id uuid REFERENCES x.a(id);
  `;
  const got = scanSql(sql, "test.sql").sort();
  const want = ["test.sql::customer_id", "test.sql::driver_id"].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`selftest FAIL: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
  // 443.101: a FOREIGN KEY declared outside the column (table constraint, ALTER TABLE ... ADD CONSTRAINT, inside a DO
  // block, composite same-entity) covers its columns; a column with no FK anywhere is still reported.
  const sep = separateFkColumns(`
    CREATE TABLE x.b (id uuid PRIMARY KEY, operating_company_id uuid, load_id uuid, other_id uuid,
      CONSTRAINT b_load_fkey FOREIGN KEY (load_id) REFERENCES mdata.loads(id));
    DO $$ BEGIN IF NOT EXISTS (SELECT 1) THEN
      ALTER TABLE x.b ADD CONSTRAINT b_je_fkey FOREIGN KEY (operating_company_id, je_id) REFERENCES accounting.journal_entries (operating_company_id, id) NOT VALID;
    END IF; END $$;
    ALTER TABLE x.c ADD CONSTRAINT c_fk FOREIGN KEY (user_id) REFERENCES identity.users(id);
  `);
  const sepWant = ["x.b.load_id", "x.b.operating_company_id", "x.b.je_id", "x.c.user_id"];
  if (!sepWant.every((c) => sep.has(c)) || sep.has("x.b.other_id")) throw new Error(`selftest FAIL: separate FKs ${JSON.stringify([...sep])}`);
  const tagged = scanSql(`CREATE TABLE x.b (id uuid PRIMARY KEY, load_id uuid, other_id uuid); ALTER TABLE x.b ADD COLUMN je_id uuid;`, "t2.sql", { withTables: true });
  const uncovered = tagged.filter((r) => !sep.has(`${r.table}.${r.col}`)).map((r) => r.key);
  if (JSON.stringify(uncovered) !== JSON.stringify(["t2.sql::other_id"])) throw new Error(`selftest FAIL: coverage ${JSON.stringify(uncovered)}`);
  // The non-FK register: kinds are name-checked, reasons required, polymorphic needs its type column, stale entries fail.
  const mig = { "m.sql": "CREATE TABLE t (source_kind text, source_id uuid)" };
  const reason = "a reason that is definitely at least thirty characters long";
  const reg = (k, e) => checkNonFkRegister({ [k]: e }, ["m.sql::samsara_route_id", "m.sql::vendor_id", "m.sql::source_id"], (f) => mig[f]);
  if (reg("m.sql::samsara_route_id", { kind: "external_id", reason }).exempt.size !== 1) throw new Error("selftest FAIL: external id not exempted");
  if (reg("m.sql::vendor_id", { kind: "external_id", reason }).problems.length !== 1) throw new Error("selftest FAIL: a real reference column was exempted as external");
  if (reg("m.sql::samsara_route_id", { kind: "external_id", reason: "short" }).problems.length !== 1) throw new Error("selftest FAIL: reasonless entry accepted");
  if (reg("m.sql::source_id", { kind: "polymorphic", reason, type_column: "nope_kind" }).problems.length !== 1) throw new Error("selftest FAIL: polymorphic without its type column accepted");
  if (reg("m.sql::source_id", { kind: "polymorphic", reason, type_column: "source_kind" }).exempt.size !== 1) throw new Error("selftest FAIL: valid polymorphic rejected");
  if (reg("m.sql::samsara_stop_id", { kind: "external_id", reason }).problems.length !== 1) throw new Error("selftest FAIL: stale register entry accepted");
  console.log("verify-orphan-fk-inventory selftest OK");
  process.exit(0);
}

if (process.env.UPDATE_ORPHAN_FK_BASELINE === "1") {
  const keys = computeInventory();
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      { _comment: "0519-ri1(a) orphan-FK inventory ratchet. Regenerate: UPDATE_ORPHAN_FK_BASELINE=1. Adding real FK constraints is owner-gated (db-integrity-hardening-0519).", count: keys.length, keys },
      null,
      2,
    ) + "\n",
  );
  console.log(`orphan-FK baseline written: ${keys.length} columns without an inline FK`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = run();
  if (failures.length) {
    console.error("verify:orphan-fk-inventory FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    process.exit(1);
  }
  console.log("verify:orphan-fk-inventory OK — no new orphan-FK columns vs baseline");
}
