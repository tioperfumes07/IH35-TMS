#!/usr/bin/env node
/**
 * GUARD: a settlement's load_count must count BOTH load paths, bill-first. ACCT-F275.
 *
 * A settlement line reaches its load two ways:
 *   (a) sl.source_driver_bill_id -> driver_bills.load_id   <-- CANONICAL
 *   (b) settlement_lines.load_id                            <-- denormalized copy, one hop downstream
 *
 * CANONICAL IS (a). The driver bill is the per-load obligation document: it is created from the load,
 * carries the load FK and the amount that becomes the line, and is the thing the settlement discharges.
 * settlement_lines.load_id is a convenience copy of that same fact. When the two disagree the
 * originating document wins — hence COALESCE(db.load_id, sl.load_id), bill first, never line first.
 *
 * WHY BOTH AND NOT JUST THE CANONICAL ONE: path (b) is populated on rows that path (a) cannot explain,
 * and those rows cannot be re-derived after the fact. Counting only (a) silently drops them; counting
 * only (b) silently drops every bill-linked line. The surface must count the union.
 *
 * MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-08 (bypass_rls set in the SAME txn; complete —
 * visible 4 == n_live_tup 4, n_tup_del 0, current_user ih35_app):
 *   settlement_lines                          4
 *   .source_driver_bill_id IS NOT NULL        0     <-- zero, not "some"
 *   .load_id IS NOT NULL                      2
 *   driver_bills / with load_id               6 / 6
 * So the previous INNER JOIN through source_driver_bill_id dropped EVERY row and the Settlements list
 * rendered "Loads = 0" for every settlement unconditionally. That is why this guard demands LEFT JOIN
 * as well as COALESCE: a COALESCE under an INNER JOIN would still have counted zero, and would have
 * looked like a fix. A wrong load_count is not cosmetic — CC-3 nearly filed a false FAIL against #5017
 * citing this column, so the bad number was actively manufacturing wrong verdicts.
 *
 * NOT GUARDED HERE, DELIBERATELY: that source_driver_bill_id is 0/4 while driver_bills is 6/6
 * load-linked means the close path never links lines to bills at all. That is the root and it is filed
 * to the board separately. Back-filling source_driver_bill_id by matching amounts or dates would be
 * inventing a linkage to make a count look correct — the same class as synthesising pending_ack.
 *
 * Run:  node scripts/verify-settlement-load-count-counts-both-paths.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src/driver-finance/settlements.routes.ts";
const LABEL = "verify-settlement-load-count-counts-both-paths";

export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** Every `( ... ) AS load_count` scalar subquery, comments already stripped. */
export function loadCountSubqueries(src) {
  const clean = stripComments(src);
  const out = [];
  const re = /SELECT\s+COUNT\s*\([\s\S]{0,600}?\)\s*AS\s+load_count/gi;
  let m;
  while ((m = re.exec(clean)) !== null) out.push(m[0]);
  return out;
}

export function collectProblems(src) {
  const problems = [];
  const subs = loadCountSubqueries(src);

  if (subs.length === 0) {
    problems.push(
      `${SRC}: no "... AS load_count" subquery found. The Settlements list reports how many loads a ` +
        `settlement covers; if that moved, move this guard with it (ACCT-F275).`
    );
    return problems;
  }

  for (const q of subs) {
    if (!/settlement_lines/i.test(q)) continue;

    const countsBill = /COUNT\s*\([\s\S]{0,200}?db\.load_id/i.test(q);
    const countsLine = /COUNT\s*\([\s\S]{0,200}?sl\.load_id/i.test(q);

    if (!(countsBill && countsLine)) {
      problems.push(
        `${SRC}: a load_count counts only ONE load path (bill=${countsBill} line=${countsLine}). ` +
          `Count the union: COUNT(DISTINCT COALESCE(db.load_id, sl.load_id)). Counting one path drops ` +
          `every settlement linked by the other and renders a wrong "Loads = N" (ACCT-F275).`
      );
      continue;
    }

    if (!/COALESCE\s*\(\s*db\.load_id\s*,\s*sl\.load_id\s*\)/i.test(q)) {
      problems.push(
        `${SRC}: load_count does not COALESCE bill-first. driver_bills.load_id is CANONICAL — the bill ` +
          `is the per-load obligation the settlement discharges; settlement_lines.load_id is a ` +
          `denormalized copy one hop downstream. Line-first would let the copy outrank the original ` +
          `when they disagree (ACCT-F275).`
      );
    }

    if (/\bJOIN\s+driver_finance\.driver_bills/i.test(q) && !/LEFT\s+JOIN\s+driver_finance\.driver_bills/i.test(q)) {
      problems.push(
        `${SRC}: load_count INNER JOINs driver_bills. source_driver_bill_id is set on 0 of 4 prod ` +
          `settlement_lines, so an inner join drops every row and the count is 0 for EVERY settlement ` +
          `no matter what COALESCE says. Use LEFT JOIN (ACCT-F275).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const wrap = (q) => "const sql = `SELECT v.*, (" + q + ") AS load_count FROM x`;";

  const GOOD = wrap(
    "SELECT COUNT(DISTINCT COALESCE(db.load_id, sl.load_id))::int FROM driver_finance.settlement_lines sl " +
      "LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id " +
      "WHERE sl.settlement_id = s.id AND COALESCE(db.load_id, sl.load_id) IS NOT NULL"
  );
  const BILL_ONLY = wrap(
    "SELECT COUNT(DISTINCT db.load_id)::int FROM driver_finance.settlement_lines sl " +
      "JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id WHERE sl.settlement_id = s.id"
  );
  const LINE_ONLY = wrap(
    "SELECT COUNT(DISTINCT sl.load_id)::int FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id"
  );
  const LINE_FIRST = wrap(
    "SELECT COUNT(DISTINCT COALESCE(sl.load_id, db.load_id))::int FROM driver_finance.settlement_lines sl " +
      "LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id WHERE sl.settlement_id = s.id"
  );
  const INNER_JOIN = wrap(
    "SELECT COUNT(DISTINCT COALESCE(db.load_id, sl.load_id))::int FROM driver_finance.settlement_lines sl " +
      "JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id WHERE sl.settlement_id = s.id"
  );

  if (collectProblems(GOOD).length !== 0) failures.push("the correct union count was flagged");
  if (!collectProblems(BILL_ONLY).some((p) => /counts only ONE load path/.test(p))) {
    failures.push("the shipped bill-only count was NOT caught — this is the exact ACCT-F275 defect");
  }
  if (!collectProblems(LINE_ONLY).some((p) => /counts only ONE load path/.test(p))) {
    failures.push("a line-only count was NOT caught");
  }
  if (!collectProblems(LINE_FIRST).some((p) => /does not COALESCE bill-first/.test(p))) {
    failures.push("line-first COALESCE was accepted — the copy would outrank the canonical bill");
  }
  if (!collectProblems(INNER_JOIN).some((p) => /INNER JOINs driver_bills/.test(p))) {
    failures.push("an INNER JOIN was accepted — COALESCE alone still counts 0 on every prod row");
  }
  // F264 shape: an explanatory SQL comment must not be able to satisfy the check.
  const COMMENT = BILL_ONLY + "\n-- COUNT(DISTINCT COALESCE(db.load_id, sl.load_id)) LEFT JOIN driver_finance.driver_bills";
  if (!collectProblems(COMMENT).some((p) => /counts only ONE load path/.test(p))) {
    failures.push("a comment faked the union — false green (the ACCT-F264 shape)");
  }
  if (!collectProblems("const x = 1;").some((p) => /no "\.\.\. AS load_count" subquery/.test(p))) {
    failures.push("a vanished load_count did not fail closed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 7/7 (union passes, bill-only caught, line-only caught, line-first caught, ` +
      `inner-join caught, comment cannot fake, fails closed)`
  );
  process.exit(0);
}

const p = path.join(root, SRC);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${SRC} is missing.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(p, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} settlement load_count gap(s):`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — load_count counts both load paths, bill-first, LEFT JOIN.`);
