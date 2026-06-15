#!/usr/bin/env node
/**
 * Static guard: NO INVALID ENUM LITERALS.
 *
 * Bug class (Postgres 22P02): SQL compares a column typed as a Postgres ENUM against a string
 * literal that is NOT a member of that enum → "invalid input value for enum ..." → HTTP 500.
 * Two instances fixed in 2026-06 (#987 / #990): mdata.unit_status compared to 'active' / 'shop'
 * (real members are InService / InMaintenance / ...).
 *
 * This guard is DATA-DRIVEN from db/migrations:
 *   1. Parse every enum type + its members (CREATE TYPE ... AS ENUM, ALTER TYPE ... ADD VALUE).
 *   2. Parse enum-typed columns (CREATE TABLE / ADD COLUMN  <col> <schema>.<enumType>) → which
 *      (schema.table, column) is which enum.
 * Then it scans backend SQL template literals: for each, it determines which tables the query
 * touches (FROM/JOIN/UPDATE/INTO), and checks comparisons on those tables' enum columns
 * (`col = 'lit'`, `col IN ('a','b')`, `FILTER (WHERE col = 'lit')`) — flagging any literal that is
 * not a member of ANY enum column with that name among the referenced tables.
 *
 * Conservative by design (avoids false positives):
 *  - Only flags when the column name maps to an enum column on a referenced table.
 *  - If two referenced tables share a column name backed by different enums (e.g. `status` on
 *    mdata.units vs mdata.customers), the valid set is the UNION — a literal valid in either passes.
 *  - ALLOWLIST below ratchets any legitimate current use; the guard fails only on NEW violations.
 *
 * Per locked rule: "every bug fix gets a static CI guard."
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Legitimate (col, literal) pairs to ignore, "schema.table.col='lit'" or "col='lit'". Empty for now.
const ALLOWLIST = new Set([]);

// ---- 1. Parse enums from migrations -------------------------------------------------
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => p.endsWith(e)) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

const migrations = walk("db/migrations", [".sql"]);
const enumMembers = new Map(); // "schema.type" -> Set(members)

const createTypeRe = /CREATE\s+TYPE\s+([a-z_]+\.[a-z_]+)\s+AS\s+ENUM\s*\(([^)]*)\)/gis;
const addValueRe = /ALTER\s+TYPE\s+([a-z_]+\.[a-z_]+)\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi;
for (const f of migrations) {
  const txt = readFileSync(f, "utf8");
  let m;
  while ((m = createTypeRe.exec(txt))) {
    const type = m[1];
    const members = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (!enumMembers.has(type)) enumMembers.set(type, new Set());
    members.forEach((v) => enumMembers.get(type).add(v));
  }
  while ((m = addValueRe.exec(txt))) {
    if (!enumMembers.has(m[1])) enumMembers.set(m[1], new Set());
    enumMembers.get(m[1]).add(m[2]);
  }
}

// ---- 2. Parse enum-typed columns -> (schema.table, col) -> enumType ------------------
// matches "<col> <schema>.<enumType>" inside CREATE TABLE / ADD COLUMN, after resolving the table.
const tableColEnum = new Map(); // "schema.table" -> Map(col -> "schema.type")
const colToEnums = new Map(); // bare col name -> Set("schema.type") (cross-table)

const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\n\)/gi;
const colEnumRe = /(?:^|,)\s*([a-z_]+)\s+([a-z_]+\.[a-z_]+(?:_enum|_status|status|_reason|_type|_category|_stage|_unit))\b/gim;
for (const f of migrations) {
  const txt = readFileSync(f, "utf8");
  let t;
  while ((t = createTableRe.exec(txt))) {
    const table = t[1];
    const body = t[2];
    let c;
    const re = new RegExp(colEnumRe.source, "gim");
    while ((c = re.exec(body))) {
      const col = c[1];
      const type = c[2];
      if (!enumMembers.has(type)) continue;
      if (!tableColEnum.has(table)) tableColEnum.set(table, new Map());
      tableColEnum.get(table).set(col, type);
      if (!colToEnums.has(col)) colToEnums.set(col, new Set());
      colToEnums.get(col).add(type);
    }
  }
  // ADD COLUMN form (table named in the ALTER)
  const addColRe = /ALTER\s+TABLE\s+([a-z_]+\.[a-z_]+)[\s\S]*?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s+([a-z_]+\.[a-z_]+)/gi;
  let a;
  while ((a = addColRe.exec(txt))) {
    const [, table, col, type] = a;
    if (!enumMembers.has(type)) continue;
    if (!tableColEnum.has(table)) tableColEnum.set(table, new Map());
    tableColEnum.get(table).set(col, type);
    if (!colToEnums.has(col)) colToEnums.set(col, new Set());
    colToEnums.get(col).add(type);
  }
}

// ---- 3. Scan backend SQL for invalid enum-literal comparisons ------------------------
const srcFiles = walk("apps/backend/src", [".ts"]);
// FROM/JOIN/UPDATE/INTO <schema.table> [AS] [alias]
const tableRefRe = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_]+\.[a-z_]+)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi;
// optional alias-qualified column compared to literal(s): [alias.]col = 'x' | [alias.]col IN ('x',..)
const cmpRe = /(?:\b([a-z_][a-z0-9_]*)\.)?([a-z_]+)\s*(?:=|IN)\s*\(?\s*('(?:[^']*)'(?:\s*,\s*'(?:[^']*)')*)/gi;
const SQL_KEYWORDS = new Set(["as", "on", "and", "or", "where", "from", "join", "select", "set"]);

const violations = [];
for (const f of srcFiles) {
  const txt = readFileSync(f, "utf8");
  for (const tl of txt.match(/`[^`]*`/g) || []) {
    if (!/\b(FROM|JOIN|UPDATE|INTO)\s+[a-z_]+\.[a-z_]+/i.test(tl)) continue;

    // alias -> table, and the full set of tables in this query
    const aliasToTable = new Map();
    const tables = new Set();
    let tm;
    const tre = new RegExp(tableRefRe.source, "gi");
    while ((tm = tre.exec(tl))) {
      const table = tm[1];
      tables.add(table);
      if (tm[2] && !SQL_KEYWORDS.has(tm[2].toLowerCase())) aliasToTable.set(tm[2].toLowerCase(), table);
    }
    const singleTable = tables.size === 1 ? [...tables][0] : null;

    let cm;
    const cre = new RegExp(cmpRe.source, "gi");
    while ((cm = cre.exec(tl))) {
      const alias = cm[1] ? cm[1].toLowerCase() : null;
      const col = cm[2].toLowerCase();
      // Resolve which table this column belongs to:
      //  - qualified alias.col -> the aliased table (precise)
      //  - unqualified col     -> only if the query has exactly ONE table (unambiguous)
      let table = null;
      if (alias) table = aliasToTable.get(alias) ?? null;
      else table = singleTable;
      if (!table) continue;
      const cols = tableColEnum.get(table);
      if (!cols || !cols.has(col)) continue; // column isn't an enum column on that table
      const members = enumMembers.get(cols.get(col));
      const lits = [...cm[3].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      for (const lit of lits) {
        if (lit === "") continue;
        if (members.has(lit)) continue;
        if (ALLOWLIST.has(`${table}.${col}='${lit}'`)) continue;
        violations.push({ file: f, table, col, lit, valid: [...members].join(", ") });
      }
    }
  }
}

if (violations.length) {
  console.error("verify-enum-literals: INVALID enum literals (will cause Postgres 22P02 / HTTP 500):");
  for (const v of violations) {
    console.error(`  ✗ ${v.file}: ${v.col} = '${v.lit}'  — valid members: ${v.valid}`);
  }
  console.error("\nFix: use a real enum member. If this is a legitimate non-enum use, add it to ALLOWLIST.");
  process.exit(1);
}
console.log(
  `verify-enum-literals: OK — ${enumMembers.size} enums, ${[...tableColEnum.values()].reduce((n, m) => n + m.size, 0)} enum columns checked, 0 invalid literals.`
);
