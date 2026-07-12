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
export function scanSql(sql, basename) {
  const clean = stripComments(sql);
  const found = [];
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
        if (m && !/\bREFERENCES\b/i.test(p)) found.push(m[1].toLowerCase());
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
        if (!/\bREFERENCES\b/i.test(window)) found.push(m[1].toLowerCase());
      }
    }
  }
  // Key by basename + column + per-file occurrence index (migrations are immutable, so keys are stable).
  const counts = new Map();
  return found.map((col) => {
    const n = (counts.get(col) ?? 0) + 1;
    counts.set(col, n);
    return `${basename}::${col}${n > 1 ? `#${n}` : ""}`;
  });
}

export function computeInventory() {
  const keys = [];
  if (fs.existsSync(MIGRATIONS)) {
    for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
      keys.push(...scanSql(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"), f));
    }
  }
  return keys.sort();
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
  return inventory.filter((k) => !baseline.has(k)).map((k) => `new orphan-FK column (no inline REFERENCES): ${k}`);
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
