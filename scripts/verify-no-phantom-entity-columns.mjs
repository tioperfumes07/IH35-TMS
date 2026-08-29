#!/usr/bin/env node
/**
 * verify-no-phantom-entity-columns.mjs
 *
 * Static CI guard against the recurring "phantom entity column" class of 500s: backend SQL that queries
 * a column the migrations never create, e.g.
 *   - mdata.units.operating_company_id      (units carry owner_company_id + currently_leased_to_company_id)
 *   - mdata.equipment.operating_company_id  (equipment carries owner_company_id + currently_leased_to_company_id)
 *   - mdata.drivers.escrow_balance          (driver escrow lives in driver_finance.escrow_balances.current_balance_cents)
 *
 * These 42703 at runtime → the endpoint 500s (FLEET-1 trailer quick-assign, DRIVER-2 escrow KPIs, and the
 * equipment-transfer inbound-confirm / samsara fault→unit resolution were all this bug). This guard fails if
 * any of those phantom references reappear in backend SQL.
 *
 * Scope: apps/backend/src ** *.ts (excluding tests). Only literal SQL (backtick template blocks) is scanned;
 * comments and ${...} interpolations (which are runtime-guarded, e.g. an information_schema column check) are
 * stripped so they never trip the guard.
 *
 * Run:  npm run verify:no-phantom-entity-columns
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = join(ROOT, "apps", "backend", "src");

/** Recursively list *.ts backend files, excluding tests. */
function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Strip block + line comments from a whole file so prose mentioning a phantom never trips the guard. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Extract backtick template-literal contents, with ${...} interpolations removed. */
function sqlBlocks(codeNoComments) {
  const parts = codeNoComments.split("`");
  const blocks = [];
  for (let i = 1; i < parts.length; i += 2) {
    const block = parts[i]
      .replace(/\$\{[^}]*\}/g, " ") // runtime-guarded interpolations
      .replace(/\/\*[\s\S]*?\*\//g, " ") // SQL /* */ comments
      .replace(/--[^\n]*/g, " "); // SQL -- line comments (often reference the phantom by name)
    blocks.push(block);
  }
  return blocks;
}

const BASE_TABLE = /\bmdata\.(units|equipment)\b(?!_)/i; // base tables only (not equipment_plates/_log/_types)
const BIND =
  /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO)\s+mdata\.(?:units|equipment)\b(?!_)(?:\s+AS)?(?:\s+(?!WHERE\b|SET\b|ON\b|LEFT\b|RIGHT\b|JOIN\b|INNER\b|USING\b|VALUES\b|GROUP\b|ORDER\b|LIMIT\b|RETURNING\b)([a-z][a-z0-9_]*))?/gi;
// RE-ANCHOR (found stale 2026-08-29): only counted FROM/JOIN/UPDATE as a "table reference" for the
// onlyUnitsEquipment tally below, so an INSERT INTO a DIFFERENT, legitimately-scoped sibling table
// (e.g. mdata.equipment_plates, which DOES carry its own real operating_company_id column) inside
// the same backtick block as a `FROM mdata.equipment` scope-validation subquery was invisible to
// the table count -- the block looked like it referenced ONLY units/equipment, so the INSERT
// target's own bare operating_company_id column got misattributed as a phantom reference on
// units/equipment. Real example: equipment-plates.routes.ts's create handler validates equipment
// ownership via `FROM mdata.equipment AS equipment ... equipment.owner_company_id = $1` (correct,
// not phantom) while INSERTing into `mdata.equipment_plates (operating_company_id, ...)` (also
// correct -- a different table with a real column) in the SAME query. Recognizing INSERT INTO as a
// table reference too fixes the count without weakening the actual units/equipment phantom check.
const ANY_TABLE = /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO)\s+[a-z_]+\.[a-z_]+/gi;
const ESCROW = /(?<![A-Za-z0-9_])escrow_balance(?![A-Za-z0-9_])/g;

function scanBlock(block) {
  const violations = [];

  // --- units/equipment entity-column phantom -------------------------------------------------
  if (BASE_TABLE.test(block) && /\boperating_company_id\b/.test(block)) {
    const aliases = new Set();
    let unaliased = 0;
    BIND.lastIndex = 0;
    let m;
    while ((m = BIND.exec(block))) {
      if (m[1]) aliases.add(m[1]);
      else unaliased += 1;
    }
    let qualified = false;
    for (const a of aliases) {
      if (new RegExp(`\\b${a}\\.operating_company_id\\b`).test(block)) {
        qualified = true;
        break;
      }
    }
    if (qualified) {
      violations.push("mdata.units/equipment alias.operating_company_id (phantom column)");
    } else {
      const totalTables = (block.match(ANY_TABLE) || []).length;
      const onlyUnitsEquipment = aliases.size + unaliased === totalTables && totalTables > 0;
      if (onlyUnitsEquipment && /(?<![\w.])operating_company_id\b/.test(block)) {
        violations.push("mdata.units/equipment bare operating_company_id (phantom column)");
      }
    }
  }

  // --- mdata.drivers.escrow_balance phantom --------------------------------------------------
  ESCROW.lastIndex = 0;
  let e;
  while ((e = ESCROW.exec(block))) {
    const pre = block.slice(Math.max(0, e.index - 6), e.index);
    if (/\bas\s*$/i.test(pre)) continue; // output alias `... AS escrow_balance` is fine
    violations.push("escrow_balance column (phantom — use driver_finance.escrow_balances.current_balance_cents)");
  }

  return violations;
}

const files = listTsFiles(BACKEND_SRC);
const findings = [];
for (const file of files) {
  const code = stripComments(readFileSync(file, "utf8"));
  for (const block of sqlBlocks(code)) {
    for (const v of scanBlock(block)) {
      findings.push({ file: relative(ROOT, file), detail: v });
    }
  }
}

if (findings.length > 0) {
  console.error("✗ verify-no-phantom-entity-columns: phantom entity-column reference(s) found:\n");
  for (const f of findings) {
    console.error(`  ${f.file}\n    → ${f.detail}`);
  }
  console.error(
    "\nThese columns do NOT exist in db/migrations. Scope units/equipment by " +
      "(owner_company_id OR currently_leased_to_company_id) and read driver escrow from " +
      "driver_finance.escrow_balances. See CLAUDE.md §4."
  );
  process.exit(1);
}

console.log(`✓ verify-no-phantom-entity-columns: ${files.length} backend files clean (no phantom entity columns).`);
