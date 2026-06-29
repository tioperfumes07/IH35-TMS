#!/usr/bin/env node
/**
 * MIG-DRIFT-AUDIT — read-only forensic scan: migration-declared DDL vs live schema.
 *
 * Motivation: #1612 proved a migration-immutability breach — db/migrations/0061 declares
 * `ADD CONSTRAINT fk_invoices_factoring_advance` that prod never received, and NO later migration
 * drops it. Source DDL != applied state. This scan finds sibling drift across FOUR object kinds:
 *   • CREATE TABLE [IF NOT EXISTS] schema.table
 *   • ALTER TABLE schema.table ADD [COLUMN] [IF NOT EXISTS] col
 *   • ALTER TABLE schema.table ADD CONSTRAINT name {FOREIGN KEY|UNIQUE|CHECK|PRIMARY KEY}
 *   • CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON schema.table
 * Later DROP/RENAME of the same object NETS it out (so legitimately-removed objects are not flagged).
 *
 * READ-ONLY. Requires an EXPLICIT --database-url (never auto-connects via .env — §1.5, same pattern as
 * #1611/#1612). Does NOT auto-fix — it only REPORTS. Each MISSING finding becomes its own
 * GUARD-reviewed repair block.
 *
 *   node scripts/audit-migration-drift.mjs --database-url="postgres://…" [--json] [--out <file>]
 *
 * Exit 0 = no declared-but-missing objects. Exit 2 = drift found. Exit 1 = usage/connection error.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

function arg(name) {
  const pre = `--${name}=`;
  const eq = process.argv.find((a) => a.startsWith(pre));
  if (eq) return eq.slice(pre.length);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined;
}
const FLAG = (n) => process.argv.includes(`--${n}`);

const url = arg("database-url");
if (!url) {
  console.error(
    "usage: audit-migration-drift --database-url=<url> [--json] [--out <file>]\n" +
      "Refusing to run without an explicit url (no .env auto-connect, §1.5)."
  );
  process.exit(1);
}

// ── strip comments so DROP/ADD inside comments don't count ──
function strip(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
const norm = (s) => s.replace(/^"+|"+$/g, "").replace(/"/g, "").trim().toLowerCase();
function qualify(raw) {
  const parts = String(raw).trim().replace(/[(),;]+$/g, "").split(".").map((p) => norm(p)).filter(Boolean);
  return parts.length === 2 ? { schema: parts[0], name: parts[1] } : { schema: null, name: parts[0] };
}

// Declared-object maps keyed for net add/drop. Value carries first-declaring file for the report.
const tables = new Map();   // "schema.table"
const columns = new Map();  // "schema.table.col"
const constraints = new Map(); // "schema.table.constraint"
const indexes = new Map();   // "schema.index"  (index names are schema-scoped in pg)

function setOnce(map, key, file) { if (!map.has(key)) map.set(key, file); }

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4,}[a-z]?_.+\.sql$/i.test(f)).sort();
for (const file of files) {
  const sql = strip(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));

  // CREATE TABLE [IF NOT EXISTS] schema.table
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w$]+"?(?:\."?[\w$]+"?)?)/gi)) {
    const t = qualify(m[1]); if (t.schema) setOnce(tables, `${t.schema}.${t.name}`, file);
  }
  // DROP TABLE [IF EXISTS] schema.table  → net out table + its owned columns/constraints
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?("?[\w$]+"?(?:\."?[\w$]+"?)?)/gi)) {
    const t = qualify(m[1]); if (!t.schema) continue;
    const tk = `${t.schema}.${t.name}`; tables.delete(tk);
    for (const k of [...columns.keys()]) if (k.startsWith(tk + ".")) columns.delete(k);
    for (const k of [...constraints.keys()]) if (k.startsWith(tk + ".")) constraints.delete(k);
  }
  // ALTER TABLE schema.table ADD [COLUMN] [IF NOT EXISTS] col   /   ADD CONSTRAINT name …
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?("?[\w$]+"?(?:\."?[\w$]+"?)?)\s+([\s\S]*?)(?=;|$)/gi)) {
    const t = qualify(m[1]); if (!t.schema) continue;
    const tk = `${t.schema}.${t.name}`;
    const body = m[2];
    for (const a of body.matchAll(/add\s+constraint\s+("?[\w$]+"?)/gi)) setOnce(constraints, `${tk}.${norm(a[1])}`, file);
    for (const d of body.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?("?[\w$]+"?)/gi)) constraints.delete(`${tk}.${norm(d[1])}`);
    for (const a of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?[\w$]+"?)/gi)) setOnce(columns, `${tk}.${norm(a[1])}`, file);
    for (const a of body.matchAll(/add\s+(?:if\s+not\s+exists\s+)?("?[a-z_][\w$]*"?)\s+/gi)) {
      // bare "ADD <col> <type>" short form — skip every DDL keyword that can follow ADD so the
      // literal words COLUMN/CONSTRAINT/PRIMARY/etc. are never mistaken for a column name.
      const col = norm(a[1]);
      const KW = new Set(["primary", "foreign", "unique", "check", "column", "constraint", "index", "if", "not", "exists", "generated"]);
      if (!KW.has(col)) setOnce(columns, `${tk}.${col}`, file);
    }
    for (const d of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?("?[\w$]+"?)/gi)) columns.delete(`${tk}.${norm(d[1])}`);
  }
  // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] name ON schema.table
  for (const m of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?("?[\w$]+"?(?:\."?[\w$]+"?)?)\s+on\s+("?[\w$]+"?(?:\."?[\w$]+"?)?)/gi)) {
    const idx = qualify(m[1]); const on = qualify(m[2]);
    const sch = idx.schema || on.schema; if (sch) setOnce(indexes, `${sch}.${idx.name}`, file);
  }
  for (const m of sql.matchAll(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?("?[\w$]+"?(?:\."?[\w$]+"?)?)/gi)) {
    const idx = qualify(m[1]); for (const k of [...indexes.keys()]) if (k === `${idx.schema}.${idx.name}` || (!idx.schema && k.endsWith("." + idx.name))) indexes.delete(k);
  }
}

const client = new Client(buildPgClientConfig(url));
const findings = [];
try {
  await client.connect();
  const who = await client.query("SELECT current_database() AS db, COALESCE(host(inet_server_addr())::text,'local-socket') AS host");
  const conn = `${who.rows[0].db} @ ${who.rows[0].host}`;

  const live = {
    tables: new Set((await client.query(`SELECT table_schema||'.'||table_name k FROM information_schema.tables`)).rows.map((r) => r.k.toLowerCase())),
    columns: new Set((await client.query(`SELECT table_schema||'.'||table_name||'.'||column_name k FROM information_schema.columns`)).rows.map((r) => r.k.toLowerCase())),
    constraints: new Set((await client.query(`SELECT constraint_schema||'.'||table_name||'.'||constraint_name k FROM information_schema.table_constraints`)).rows.map((r) => r.k.toLowerCase())),
    indexes: new Set((await client.query(`SELECT schemaname||'.'||indexname k FROM pg_indexes`)).rows.map((r) => r.k.toLowerCase())),
  };

  const check = (kind, map, liveSet) => {
    for (const [key, file] of map) if (!liveSet.has(key)) findings.push({ kind, key, file });
  };
  check("table", tables, live.tables);
  check("column", columns, live.columns);
  check("constraint", constraints, live.constraints);
  check("index", indexes, live.indexes);
  findings.sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key));

  const counts = { table: tables.size, column: columns.size, constraint: constraints.size, index: indexes.size };
  const summary = {
    connected: conn,
    declared: counts,
    missing: findings.length,
    findings,
  };

  if (FLAG("json")) {
    const out = JSON.stringify(summary, null, 2);
    if (arg("out")) fs.writeFileSync(arg("out"), out + "\n");
    else console.log(out);
  } else {
    console.log(`[migration-drift] connected: ${conn}`);
    console.log(`[migration-drift] declared: ${counts.table} tables, ${counts.column} columns, ${counts.constraint} constraints, ${counts.index} indexes`);
    console.log(`[migration-drift] declared-but-MISSING in live schema: ${findings.length}`);
    for (const f of findings) console.log(`  MISSING ${f.kind}: ${f.key}  (declared in ${f.file})`);
    if (arg("out")) fs.writeFileSync(arg("out"), `${conn}\nmissing=${findings.length}\n` + findings.map((f) => `MISSING ${f.kind}: ${f.key} (${f.file})`).join("\n") + "\n");
  }
  process.exit(findings.length > 0 ? 2 : 0);
} catch (err) {
  console.error(`[migration-drift] ERROR: ${String(err?.message ?? err)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
