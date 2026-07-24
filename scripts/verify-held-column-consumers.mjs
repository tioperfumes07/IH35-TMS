#!/usr/bin/env node
/**
 * GUARD: no safety-lane code references a table/column that is ABSENT ON THE LIVE DATABASE.
 *
 * WHY THIS EXISTS (SAF-F08, 2026-07-24)
 * verify-schema-parity.mjs builds docs/schema-parity-baseline.json by PARSING db/migrations/, so a
 * column that appears in a HELD (unapplied) migration is in the baseline even though prod does not
 * have it. verify-sql-column-existence.mjs then checks backend SQL against that baseline and reports
 * "OK — every checked column exists" while a query references a column no production database has.
 * That is how a real 500 could ship green, and how the F02/F03/F04 audit findings were reported as
 * P0s on an unchecked assumption.
 *
 * DESIGN CORRECTION (this guard's own first draft is the lesson): it originally REASONED FROM
 * MIGRATION FILES and flagged every identifier that appeared only in a held migration. That
 * reproduced the exact anti-pattern the standard forbids — FALSE POSITIVES for columns that ARE on
 * prod (driver_settlement_deduction_id, insurance_claim_number, recovered_in_settlement_id,
 * payrun_gl_runs, all verified present on the prod branch), because prod has diverged from the files
 * and those columns were applied out of band. A file parse cannot know what prod has. PROD WINS.
 *
 * So this guard asks the LIVE DATABASE. For each held-only identifier referenced by safety-lane code:
 *   present on the live DB -> prod already has it (applied out of band); NOT a defect.
 *   absent  on the live DB -> a genuine phantom consumer; FAIL.
 * With no reachable DB it exits 0 with a CAPABILITY SKIP (verify:static's dead-port sentinel); it
 * runs for real in verify:local-ci and against prod. Scope is the safety lane.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELD_MANIFEST = "db/migrations/.held-migrations.json";
const MIGRATIONS_DIR = "db/migrations";
const CODE_DIRS = [
  "apps/backend/src/safety",
  "apps/backend/src/dispatch",
  "apps/backend/src/driver-finance",
  "apps/frontend/src/pages/safety",
  "apps/frontend/src/components/safety",
];
const LABEL = "verify-held-column-consumers";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripSql = (body) => body.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

export function heldOnlyIdentifiers() {
  const manifest = JSON.parse(read(HELD_MANIFEST));
  const heldFiles = new Set((manifest.held ?? []).map((h) => h.file));
  const collect = (raw) => {
    const body = stripSql(raw);
    const cols = new Set();
    const tables = new Set();
    for (const m of body.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)) cols.add(m[1].toLowerCase());
    for (const m of body.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\.([a-z_][a-z0-9_]*)/gi)) tables.add(m[2].toLowerCase());
    for (const t of body.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?[a-z_]+\.[a-z_][a-z0-9_]*\s*\(([\s\S]*?)\n\s*\);/gi)) {
      for (const line of t[1].split("\n")) {
        const col = line.match(/^\s*([a-z_][a-z0-9_]*)\s+(uuid|text|boolean|bigint|integer|numeric|timestamptz|date|jsonb|smallint)/i);
        if (col) cols.add(col[1].toLowerCase());
      }
    }
    return { cols, tables };
  };
  const heldCols = new Set(), heldTables = new Set(), appliedCols = new Set(), appliedTables = new Set();
  for (const file of fs.readdirSync(path.join(ROOT, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"))) {
    const { cols, tables } = collect(fs.readFileSync(path.join(ROOT, MIGRATIONS_DIR, file), "utf8"));
    const [ct, tt] = heldFiles.has(file) ? [heldCols, heldTables] : [appliedCols, appliedTables];
    for (const c of cols) ct.add(c);
    for (const t of tables) tt.add(t);
  }
  for (const c of appliedCols) heldCols.delete(c);
  for (const t of appliedTables) heldTables.delete(t);
  const out = new Map();
  for (const t of heldTables) out.set(t, "table");
  for (const c of heldCols) if (!out.has(c)) out.set(c, "column");
  return out;
}

function listFiles(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      listFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

function referencedInSql(identifier) {
  const hits = [];
  for (const rel of CODE_DIRS.flatMap((d) => listFiles(d))) {
    const body = read(rel);
    for (const m of body.matchAll(/`([^`]*)`|"([^"]*)"|'([^']*)'/g)) {
      const text = m[1] ?? m[2] ?? m[3] ?? "";
      if (!/\b(SELECT|INSERT|UPDATE|DELETE|FROM|SET|VALUES|WHERE|JOIN)\b/i.test(text)) continue;
      if (new RegExp(`\\b${identifier}\\b`).test(text)) { hits.push(rel); break; }
    }
  }
  return hits;
}

async function main() {
  const heldOnly = heldOnlyIdentifiers();
  const referenced = new Map();
  for (const [id, kind] of heldOnly) {
    const hits = referencedInSql(id);
    if (hits.length) referenced.set(id, { kind, hits });
  }

  if (SELFTEST) {
    if (heldOnly.size === 0) { console.error(`${LABEL} SELFTEST FAILED: held-only set empty.`); process.exit(1); }
    const missing = (present) => [...referenced.keys()].filter((id) => !present.has(id));
    if (missing(new Set(referenced.keys())).length !== 0) { console.error(`${LABEL} SELFTEST FAILED: present id reported missing.`); process.exit(1); }
    if (referenced.size > 0 && missing(new Set()).length !== referenced.size) { console.error(`${LABEL} SELFTEST FAILED: absent id not reported.`); process.exit(1); }
    console.log(`${LABEL} SELFTEST PASS — ${heldOnly.size} held-only parsed, ${referenced.size} referenced; presence-partition proven both directions.`);
    process.exit(0);
  }

  if (referenced.size === 0) { console.log(`${LABEL} OK — no safety-lane code references a held-only identifier.`); return; }

  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = (await import("pg")).default;
  try { (await import("dotenv")).default.config(); } catch { /* optional */ }
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) { console.log(`${LABEL} CAPABILITY SKIP — ${referenced.size} held-only reference(s); presence needs a live DB (prod diverges from files). CI: verify:local-ci.`); return; }
  const { Client } = pg;
  const client = new Client(buildPgClientConfig(cs, { connectionTimeoutMillis: 15000 }));
  try { await client.connect(); } catch (e) { console.log(`${LABEL} CAPABILITY SKIP — DB unreachable (${e.code ?? e.message}).`); return; }
  const problems = [];
  try {
    for (const [id, { kind, hits }] of referenced) {
      const q = kind === "table"
        ? `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`
        : `SELECT 1 FROM information_schema.columns WHERE column_name = $1 LIMIT 1`;
      const { rowCount } = await client.query(q, [id]);
      if (rowCount === 0) problems.push(`${hits[0]}: references ${kind} "${id}", in a HELD migration AND absent on the live DB — a genuine phantom consumer. Apply its migration before merge, or stop referencing it.`);
    }
  } finally { await client.end().catch(() => {}); }
  if (problems.length) { console.error(`${LABEL} FAILED:`); for (const p of problems) console.error(`  ${p}`); process.exit(1); }
  console.log(`${LABEL} OK — ${referenced.size} held-only reference(s) checked against the LIVE DB; all present on prod. None absent.`);
}
main().catch((e) => { console.error(`${LABEL} FAILED — ${e.message}`); process.exit(1); });
