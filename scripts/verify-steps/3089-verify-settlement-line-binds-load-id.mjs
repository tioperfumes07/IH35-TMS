#!/usr/bin/env node
/**
 * P36 (WIRING-PLAN-50) — `driver_finance.settlement_lines.load_id` (added by migration
 * 202607430000) sat unwritten by every INSERT site in the codebase. The primary earnings-line
 * writer, `appendSettlementLineFromDriverBillIfMissing` in settlement-engine.ts, already RESOLVES
 * the load — `input.loadId` is how it finds the eligible driver_bills row in the first place — so
 * there was no excuse for the FK to be left NULL on every row it inserts.
 *
 * Measured live on prod USMCA (tiny-field-89581227): settlement_lines row `90e3506f…` (settlement
 * `9910302b…`, source_driver_bill_id `31f155f3…`) has `load_id = NULL` despite the settlement engine
 * having resolved that exact load to find the bill. Same class as CLS-DISP-WIRE-07 / ACCT-F351: the
 * FK exists, the value is known at write time, and nothing carried it across.
 *
 * FIX: feature-detect the load_id column (same style as the existing source_driver_bill_id /
 * team_id checks in this function, so it keeps working against a DB that predates the column) and
 * thread `input.loadId` into every INSERT branch.
 *
 * INVARIANTS (static — no database, runs in every CI context including fresh-DB):
 *   A. The function feature-detects `load_id` on driver_finance.settlement_lines (a hasLoadCol-style
 *      check), so a DB where the column is not yet migrated does not crash the write path.
 *   B. Every branch's INSERT statement that reaches the database includes a code path that adds
 *      `load_id` to the column list when the column exists — not left as a per-branch omission.
 *   C. `input.loadId` — the load this function was CALLED to write a line for — is the value bound,
 *      not some other id (e.g. never a hardcoded/omitted value when the column is present).
 *
 * Self-test: node scripts/verify-steps/3089-verify-settlement-line-binds-load-id.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3089-verify-settlement-line-binds-load-id";
const FILE = path.join("apps", "backend", "src", "driver-finance", "settlement-engine.ts");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sliceFunction(code, name) {
  const start = code.indexOf(`export async function ${name}`);
  if (start < 0) return null;
  // Isolate up to the next top-level `export` after this function's own export line.
  const next = code.indexOf("\nexport ", start + 1);
  return next > 0 ? code.slice(start, next) : code.slice(start);
}

export function checkWiring(src) {
  const errors = [];
  const code = stripComments(src);
  const fn = sliceFunction(code, "appendSettlementLineFromDriverBillIfMissing");
  if (!fn) {
    errors.push("appendSettlementLineFromDriverBillIfMissing not found in settlement-engine.ts");
    return errors;
  }

  // Invariant A: feature-detects the load_id column, does not assume it exists.
  if (!/column_name\s*=\s*'load_id'/.test(fn)) {
    errors.push("no feature-detection query for settlement_lines.load_id — column presence is assumed, not checked");
  }

  // Invariant B: every INSERT statement in this function must have SOME code path that can add
  // load_id to its column list. We check that the string "load_id" appears inside each INSERT's
  // own column-list region (between "INSERT INTO driver_finance.settlement_lines (" and the
  // matching "VALUES"/"SELECT" clause), tolerating the dynamic `${loadCols.join("")}` interpolation.
  const insertBlocks = [...fn.matchAll(/INSERT INTO driver_finance\.settlement_lines\s*\(([\s\S]*?)\)\s*\n\s*(VALUES|SELECT)/g)];
  if (insertBlocks.length < 4) {
    errors.push(`expected 4 settlement_lines INSERT branches in appendSettlementLineFromDriverBillIfMissing, found ${insertBlocks.length}`);
  }
  const missing = insertBlocks.filter((m) => !/load_id|loadCols/.test(m[1]));
  if (missing.length > 0) {
    errors.push(`${missing.length} of ${insertBlocks.length} settlement_lines INSERT branch(es) have no load_id / loadCols reference in their column list`);
  }

  // Invariant C: the bound value must be input.loadId, not some other identifier.
  if (!/loadParam\s*=\s*hasLoadCol\.rows\[0\]\?\.ok\s*\?\s*\[input\.loadId\]/.test(fn)) {
    errors.push("the load_id parameter is not sourced from input.loadId — wrong value could be bound");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = checkWiring(real);
  if (good.length !== 0) {
    console.error(`[${LABEL}] selftest baseline FAIL — real code should pass but does not:`, good);
    process.exit(1);
  }

  // Mutation 1: strip load_id from every INSERT's column list (simulate the pre-fix state).
  const strippedCols = real.replace(/\$\{loadCols\.join\(""\)\}/g, "").replace(/,\s*load_id/g, "");
  const bad1 = checkWiring(strippedCols);
  if (!bad1.length) fail("selftest mutation 1 (load_id stripped from column lists) did not fail — invariant B is inert");

  // Mutation 2: remove the feature-detection query.
  const noDetect = real.replace(/column_name\s*=\s*'load_id'/, "column_name = 'not_load_id'");
  const bad2 = checkWiring(noDetect);
  if (!bad2.length) fail("selftest mutation 2 (feature-detection query removed) did not fail — invariant A is inert");

  // Mutation 3: bind the wrong value (e.g. settlementId instead of loadId).
  const wrongValue = real.replace(
    "const loadParam = hasLoadCol.rows[0]?.ok ? [input.loadId] : [];",
    "const loadParam = hasLoadCol.rows[0]?.ok ? [input.settlementId] : [];"
  );
  const bad3 = checkWiring(wrongValue);
  if (!bad3.length) fail("selftest mutation 3 (wrong bound value) did not fail — invariant C is inert");

  console.log(`[${LABEL}] selftest: PASS — all 3 mutations caught`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const errors = checkWiring(src);
if (errors.length) {
  console.error(`[${LABEL}] FAIL:`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — settlement_lines.load_id is feature-detected and bound from input.loadId in all 4 INSERT branches`);
