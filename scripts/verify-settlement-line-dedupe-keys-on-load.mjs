#!/usr/bin/env node
// ACCT-F11098 — a settlement line is per LOAD. The "SET-24 LINE-DUP" sweep (scripts/ops/void-duplicate-settlement-lines.ts)
// grouped driver_finance.settlement_lines by (settlement, line_type, description, amount) WITHOUT the load and voided 105
// real per-load lines (69 escrow_contribution + 36 extra_pay, $25.00 each, 0 with a same-load twin) whose dollars the posted
// headers, the 2100-xx escrow credits and accounting.escrow_posting_loads still carried. They were reinstated through the
// universal reinstate engine (reinstateDocument type settlement_line).
//
// This guard keeps it fixed, statically (no DB):
//   A. every source file that voids settlement_lines (SET is_active = false) from a duplicate grouping
//      (GROUP BY ... HAVING count(*) > 1 over driver_finance.settlement_lines) carries load_id in that GROUP BY and
//      excludes lines without a load (load_id IS NOT NULL);
//   B. the reinstate engine refuses a true duplicate by an ACTIVE twin on the same load (load_id IS NOT DISTINCT FROM),
//      and the settlement_line stamp family turns is_active back on and keeps the void history (prior_void_*);
//   C. the settlement statement readers (HTML document + PDF) print live lines only (is_active = true).
// --selftest plants each defect and proves the guard fails on it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expandWith, loadPredicates } from "./lib/expand-live-document-predicates.mjs";
// sweepA (2026-11-10) — sources are read through the canonical predicate expander: a reader that spells the exclusion
// with the shared helper (`${notVoided("x")}`, `${liveDriverBill("db")}`, …, required by
// verify-live-document-predicates-single-source) is judged on the SQL the REAL helper emits. Deleting the helper call,
// or a helper body that stops emitting the predicate, still fails this guard.
const LIVE_PREDICATES = await loadPredicates();

const LABEL = "verify-settlement-line-dedupe-keys-on-load";
const ROOT = process.cwd();
const SCAN_DIRS = ["scripts", "apps/backend/src"];
const SELF = "scripts/verify-settlement-line-dedupe-keys-on-load.mjs";

const ENGINE = "apps/backend/src/accounting/reinstate-document.service.ts";
const STAMP = "apps/backend/src/accounting/void-document-stamp.service.ts";
const STATEMENT_READERS = [
  "apps/backend/src/driver-finance/settlement-document.service.ts",
  "apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts",
];

function walk(dir, out) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|mts|mjs|js|cjs)$/.test(name) && !/\.test\.|__tests__/.test(p)) out.push(p);
  }
  return out;
}

/** Every GROUP BY list (up to HAVING / ORDER / LIMIT / closing backtick) in a SQL-bearing text. */
export function groupByLists(text) {
  const lists = [];
  const re = /GROUP\s+BY\s+([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|`|\)\s*(?:SELECT|,)|$)/gi;
  let m;
  while ((m = re.exec(text))) lists.push(m[1].replace(/\s+/g, " ").trim());
  return lists;
}

/** Check A on one file's text. Returns failure strings. */
export function judgeSweepSource(file, text) {
  const failures = [];
  const voidsLines =
    /driver_finance\.settlement_lines/.test(text) && /UPDATE\s+driver_finance\.settlement_lines[\s\S]{0,200}?is_active\s*=\s*false/i.test(text);
  const dupGrouping = /HAVING\s+count\(\*\)\s*>\s*1/i.test(text) && /FROM\s+driver_finance\.settlement_lines/i.test(text);
  if (!voidsLines || !dupGrouping) return failures;
  const lists = groupByLists(text).filter((l) => /settlement_id/.test(l));
  if (lists.length === 0) {
    failures.push(`${file}: voids settlement_lines from a duplicate grouping but no GROUP BY over settlement_id was found to verify`);
  }
  for (const l of lists) {
    if (!/\bload_id\b/.test(l)) {
      failures.push(`${file}: duplicate grouping "GROUP BY ${l}" has no load_id — per-load lines on different loads would be voided as duplicates`);
    }
  }
  if (!/load_id\s+IS\s+NOT\s+NULL/i.test(text)) {
    failures.push(`${file}: duplicate sweep does not exclude lines with no load (load_id IS NOT NULL) — nothing proves two load-less lines are the same event`);
  }
  return failures;
}

/** Check B on the engine + stamp text. */
export function judgeEngine(engineText, stampText) {
  const failures = [];
  if (!/async function reinstateSettlementLine\(/.test(engineText)) failures.push(`${ENGINE}: reinstateSettlementLine is missing`);
  if (!/case "settlement_line":\s*\n\s*return reinstateSettlementLine\(/.test(engineText)) {
    failures.push(`${ENGINE}: reinstateDocument does not dispatch type settlement_line to reinstateSettlementLine`);
  }
  if (!/t\.load_id IS NOT DISTINCT FROM sl\.load_id/.test(engineText)) {
    failures.push(`${ENGINE}: the true-duplicate twin test does not key on the load (t.load_id IS NOT DISTINCT FROM sl.load_id)`);
  }
  if (!/escrow_posting_loads/.test(engineText) || !/escrow_not_posted_for_line/.test(engineText)) {
    failures.push(`${ENGINE}: an escrow line reinstate is not proven against accounting.escrow_postings / escrow_posting_loads`);
  }
  if (!/reinstate_exceeds_posted_header/.test(engineText)) {
    failures.push(`${ENGINE}: a closed settlement's line reinstate is not proven against the posted header totals`);
  }
  const fam = stampText.match(/settlement_line:\s*\{[\s\S]*?\n {2}\},/);
  if (!fam) failures.push(`${STAMP}: no settlement_line reinstate family`);
  else {
    if (!/activeFlagColumn:\s*"is_active"/.test(fam[0])) failures.push(`${STAMP}: settlement_line family does not turn is_active back on`);
    if (!/keepsVoidHistory:\s*true/.test(fam[0])) failures.push(`${STAMP}: settlement_line family does not keep the void history`);
  }
  if (!/prior_void_reason = \$\{reasonCol\}/.test(stampText)) failures.push(`${STAMP}: stampDocumentReinstated does not copy the void reason into prior_void_reason`);
  return failures;
}

/** Check C on one statement reader. */
export function judgeStatementReader(file, text) {
  const q = text.match(/FROM driver_finance\.settlement_lines[\s\S]*?ORDER BY (?:sl\.)?created_at ASC/);
  if (!q) return [`${file}: statement line query not found`];
  if (!/is_active = true/.test(q[0]) || !/voided_at IS NULL/.test(q[0])) {
    return [`${file}: the statement prints voided settlement lines (no is_active = true AND voided_at IS NULL)`];
  }
  return [];
}

function read(rel) {
  return expandWith(LIVE_PREDICATES, readFileSync(join(ROOT, rel), "utf8"));
}

function runLive() {
  const failures = [];
  let scanned = 0;
  for (const d of SCAN_DIRS) {
    for (const f of walk(join(ROOT, d), [])) {
      const rel = relative(ROOT, f);
      if (rel === SELF) continue;
      scanned += 1;
      failures.push(...judgeSweepSource(rel, readFileSync(f, "utf8")));
    }
  }
  failures.push(...judgeEngine(read(ENGINE), read(STAMP)));
  for (const r of STATEMENT_READERS) failures.push(...judgeStatementReader(r, read(r)));
  return { failures, scanned };
}

function selftest() {
  const good = read("scripts/ops/void-duplicate-settlement-lines.ts");
  const cases = [];
  // A1: the original defect — GROUP BY without load_id.
  const bad1 = good
    .replace("GROUP BY settlement_id, line_type, description, amount, load_id, source_driver_bill_id", "GROUP BY settlement_id, line_type, description, amount");
  cases.push(["A1 group by without load", judgeSweepSource("planted.ts", bad1).length > 0]);
  // A2: load in the key but load-less lines still swept.
  const bad2 = good.replace("AND sl.load_id IS NOT NULL", "");
  cases.push(["A2 load-less lines swept", judgeSweepSource("planted.ts", bad2).length > 0]);
  cases.push(["A0 fixed sweep passes", judgeSweepSource("good.ts", good).length === 0]);
  // B: twin test that ignores the load; family that leaves is_active false; history erased.
  const engine = read(ENGINE);
  const stamp = read(STAMP);
  cases.push(["B0 engine passes", judgeEngine(engine, stamp).length === 0]);
  cases.push(["B1 twin ignores load", judgeEngine(engine.replace("t.load_id IS NOT DISTINCT FROM sl.load_id", "true"), stamp).length > 0]);
  cases.push(["B2 is_active not restored", judgeEngine(engine, stamp.replace('activeFlagColumn: "is_active",\n    keepsVoidHistory', "keepsVoidHistory")).length > 0]);
  cases.push(["B3 void history erased", judgeEngine(engine, stamp.replace("keepsVoidHistory: true,\n  },\n};", "\n  },\n};")).length > 0]);
  // C: statement reader without the live-line predicate.
  const r = read(STATEMENT_READERS[1]);
  cases.push(["C0 reader passes", judgeStatementReader("r", r).length === 0]);
  cases.push(["C1 reader prints voided lines", judgeStatementReader("r", r.replace(/\n\s*-- ACCT-F11098[^\n]*\n\s*AND is_active = true\n\s*AND voided_at IS NULL/, "")).length > 0]);
  // sweepA — the reader spells the predicate with the shared helper; deleting the helper call is still caught.
  const rawDoc = readFileSync(join(ROOT, STATEMENT_READERS[0]), "utf8");
  cases.push(["C2 helper call deleted", rawDoc.includes('AND ${notVoided("sl")}') && judgeStatementReader("d", expandWith(LIVE_PREDICATES, rawDoc.replace('AND ${notVoided("sl")}', ""))).length > 0]);
  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  if (!ok) {
    console.error(`${LABEL} --selftest: FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS (${cases.length} cases)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { failures, scanned } = runLive();
  if (failures.length) {
    for (const f of failures) console.error(`FAIL  ${f}`);
    console.error(`${LABEL}: FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${scanned} source files scanned; settlement-line duplicate sweeps key on the load; reinstate engine + statement readers wired`);
}
