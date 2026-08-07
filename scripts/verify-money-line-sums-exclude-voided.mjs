#!/usr/bin/env node
/**
 * verify-money-line-sums-exclude-voided.mjs — ACCT-F156. A SUM over a money LINE table must exclude
 * voided / soft-deleted rows.
 *
 * WHY THIS EXISTS, and it is worth being precise because there are currently ZERO violations in
 * application code. This guard was written after the error was made in an ad-hoc reconciliation query,
 * not found in a service — and it is exactly the kind of error that reads as a real financial defect.
 *
 * Verifying the AP header-vs-lines tie-out on prod (2026-08-07, RLS-bypassed with the completeness
 * discriminator: visible 16,258 == n_live_tup 16,258, current_user asserted in the same statement), the
 * first pass reported 3 bills drifting by $235.00 — a $200 break on 13459-5755, $25 on 13573-5755, $10
 * on 13453-5748. Every one of those "drifts" was exactly the amount of a VOIDED line still sitting in
 * accounting.bill_lines. Re-run with `FILTER (WHERE l.voided_at IS NULL)`: 16,256 of 16,258 tie
 * EXACTLY, 0 drifts, $0.00. The two remaining lineless bills are TMS-native test rows (CC3-BILL-0001,
 * duplicated) and ZERO QBO clones are lineless.
 *
 * So the books were right and the query was wrong. That is the trap: void-not-delete is a core
 * invariant here — voided rows REMAIN in the table by design, carrying their original amount — so any
 * aggregate that forgets the filter silently reports a financial discrepancy that does not exist. A
 * false discrepancy in AP is expensive in exactly the way a real one is: someone investigates, someone
 * "corrects" it, and the correction is the actual damage.
 *
 * The inverse is worse and this guard catches it too: a sum that omits the filter can just as easily
 * UNDER-report, because a voided credit line (a negative amount) left in the sum understates what is
 * owed.
 *
 * WHAT IT ASSERTS: any SQL in application code that SUMs a money line column must, within the same
 * statement, carry a voided_at IS NULL / soft_deleted_at IS NULL predicate. Scoped to statements that
 * actually reference a money LINE table, so aggregates over unrelated tables are never touched. Tests
 * are excluded: a fixture may legitimately assert the pre-filter total.
 *
 * There are zero violations today. This locks that in rather than discovering it again from a $235
 * discrepancy that was never real.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-line-sums-exclude-voided";
const SRC = path.join(ROOT, "apps", "backend", "src");

/**
 * TABLE-AWARE, and this is the correction that makes the guard usable. The first cut matched any money
 * line table against one generic predicate and produced 2 false positives out of 3 — it flagged a SUM
 * written inside a COMMENT, and it flagged accounting.expense_lines, which has NO soft-delete column at
 * all, so there is nothing there to filter. A guard that is wrong two times in three teaches people to
 * ignore it, which is worse than not having it.
 *
 * Each table's real column, verified against prod information_schema (2026-08-07) rather than assumed —
 * all three differ, and expense_lines has none:
 *     accounting.bill_lines            -> voided_at
 *     accounting.invoice_lines         -> soft_deleted_at
 *     driver_finance.settlement_lines  -> is_active
 *     accounting.expense_lines         -> (none: hard-delete only; excluded by construction)
 */
export const LINE_TABLE_SOFT_DELETE = {
  bill_lines: /voided_at\s+IS\s+NULL/i,
  invoice_lines: /soft_deleted_at\s+IS\s+NULL/i,
  settlement_lines: /is_active\s*=\s*true|is_active\s+IS\s+TRUE/i,
};
// Matches SUM(x) AND one level of nesting — SUM(ABS(sl.amount)), SUM(COALESCE(l.amount,0)).
// The plain form missed loadChargebacksCents' SUM(ABS(sl.amount)) entirely: a guard that
// under-matches is exactly as useless as one that false-positives, and this one had both faults
// before it was exercised against real code.
const MONEY_SUM = /SUM\s*\((?:[^()]|\([^()]*\))*?\b(amount|line_total_cents|amount_cents)\b(?:[^()]|\([^()]*\))*?\)/gi;

/** Strip // and /* *\/ comments so a SUM written in prose is never mistaken for SQL. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Scope the check to the ENCLOSING SQL STATEMENT (the backtick template literal), not a character
 * window. A window is the wrong unit twice over: too small and a long CASE expression or an
 * explanatory comment pushes the predicate out of range (a false RED), too large and it picks up a
 * filter belonging to a DIFFERENT query in the same file (a false GREEN — the dangerous direction).
 * The template literal is the actual boundary of the statement, so it is the honest one.
 */
function enclosingStatement(src, index) {
  const open = src.lastIndexOf("`", index);
  if (open === -1) return null;
  const close = src.indexOf("`", index);
  if (close === -1) return null;
  return src.slice(open + 1, close);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", "__tests__"].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.[cm]?ts$/.test(e.name) && !/\.(test|spec)\.[cm]?ts$/.test(e.name)) out.push(p);
  }
  return out;
}

export function findUnfilteredSums(root = SRC) {
  const offenders = [];
  for (const file of walk(root)) {
    const raw = fs.readFileSync(file, "utf8");
    const src = stripComments(raw); // offsets preserved, so line numbers stay accurate
    MONEY_SUM.lastIndex = 0;
    let m;
    while ((m = MONEY_SUM.exec(src))) {
      const seg = enclosingStatement(src, m.index);
      if (!seg) continue; // not inside a SQL template literal
      for (const [table, filter] of Object.entries(LINE_TABLE_SOFT_DELETE)) {
        if (!new RegExp(`\\b${table}\\b`, "i").test(seg)) continue;
        if (filter.test(seg)) break;          // correctly filtered for THIS table
        offenders.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          line: src.slice(0, m.index).split("\n").length,
          expr: m[0],
          table,
        });
        break;
      }
    }
  }
  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — every money-line SUM excludes voided/soft-deleted rows`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${offenders.length} money-line SUM(s) with no voided/soft-delete filter:\n`);
  for (const o of offenders) console.error(`  - ${o.file}:${o.line}  ${o.expr} over ${o.table}`);
  console.error(
    `\nvoid-not-delete means a voided line STAYS in the table with its original amount. A sum that does\n` +
      `not exclude it reports a financial discrepancy that does not exist — and a false discrepancy in\n` +
      `AP costs what a real one costs, because someone investigates it and someone "corrects" it.\n` +
      `A voided NEGATIVE line is worse still: it under-reports what is owed.\n\n` +
      `Fix: add FILTER (WHERE l.voided_at IS NULL) — or the equivalent WHERE predicate — in the same\n` +
      `statement as the SUM.\n`
  );
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "void-sum-"));
  const f = path.join(tmp, "svc.ts");
  const failures = [];

  const filtered = "const q = `SELECT SUM(l.amount) FROM accounting.bill_lines l WHERE l.voided_at IS NULL`;";
  fs.writeFileSync(f, filtered);
  if (findUnfilteredSums(tmp).length !== 0) failures.push("case1 FAIL — filtered sum must be GREEN.");

  fs.writeFileSync(f, "const q = `SELECT SUM(l.amount) FROM accounting.bill_lines l WHERE l.bill_id = $1`;");
  if (findUnfilteredSums(tmp).length !== 1) failures.push("case2 FAIL — unfiltered money-line sum must go RED.");

  // an aggregate over a NON-line table is not this guard's business
  fs.writeFileSync(f, "const q = `SELECT SUM(b.amount_cents) FROM accounting.bills b WHERE b.id = $1`;");
  if (findUnfilteredSums(tmp).length !== 0) failures.push("case3 FAIL — non-line-table sum must not be flagged.");

  fs.writeFileSync(f, filtered);
  if (findUnfilteredSums(tmp).length !== 0) failures.push("case4 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — filtered GREEN, unfiltered RED, non-line-table ignored, restore GREEN`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(findUnfilteredSums()));
}
