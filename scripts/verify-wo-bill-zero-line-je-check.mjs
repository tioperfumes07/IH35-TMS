#!/usr/bin/env node
/**
 * GUARD — verify-wo-bill-zero-line-je-check
 *
 * WO-BILL-ZERO-LINE-JE-CHECK-VIOLATION: copyToAccountingLines() (two-section-service.ts) copies
 * every maintenance.work_order_lines row for a WO into accounting.bill_lines / expense_lines,
 * including a Section B "item line" that carries typed part/labor sub_rows — the normal, expected
 * shape (see SectionBLine.sub_rows). That parent/container row's OWN total_cost is always 0 (the
 * real cost lives entirely in its children, copied separately as their own rows). Reproduced live:
 * creating a real typed parts+labor WO through the canonical "Create work order & Bill" flow (the
 * exact path WO-AUTO-BILL-NEVER-POSTS-GL-JE just wired a poster onto) 500s and rolls back, because
 * the poster builds one JE debit per bill_line unconditionally and the $0 container line violates
 * journal_entry_postings' `amount_cents > 0` CHECK. Fixed at the source — the same fix serves both
 * the bill and expense branches copyToAccountingLines already shares, adds no new GL math, and
 * does not touch the poster: a $0 line is never a real financial line item (it already contributes
 * nothing to Section B's own total via the existing max(own, sub_total) computation).
 *
 * METHOD: static source-text assertion on two-section-service.ts's copyToAccountingLines source
 * query. --selftest mutates the REAL file and requires the offender to be caught.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-wo-bill-zero-line-je-check";
const TARGET = "apps/backend/src/maintenance/two-section-service.ts";

export function check(text) {
  const problems = [];
  const fnStart = text.indexOf("async function copyToAccountingLines");
  if (fnStart === -1) {
    problems.push("could not find copyToAccountingLines in the file.");
    return problems;
  }
  // copyToAccountingLines is the last top-level function in the file — slice to EOF is safe.
  const fn = text.slice(fnStart);

  const sourceQueryStart = fn.indexOf("FROM maintenance.work_order_lines");
  if (sourceQueryStart === -1) {
    problems.push("could not find the work_order_lines source query in copyToAccountingLines.");
    return problems;
  }
  // The whole source-query literal (to its closing backtick), not a fixed-width window: the WHERE carries a long
  // explanatory comment, and a fixed window silently stops covering the filter as that comment grows.
  const literalEnd = fn.indexOf("`", sourceQueryStart);
  const sourceQuery = fn.slice(sourceQueryStart, literalEnd === -1 ? undefined : literalEnd);

  // ACCT-F4431334 (659d3c7187) aliased the source table (`maintenance.work_order_lines l`, joined to its parent line
  // and the item catalog), so the filter is now `l.total_cost <> 0`; the bare spelling stays accepted.
  if (!/AND\s+(?:l\.)?total_cost\s*<>\s*0\b/.test(sourceQuery)) {
    problems.push(
      "source query does not exclude total_cost = 0 rows — a $0 Section B container line will " +
        "still be copied into bill_lines/expense_lines and violate journal_entry_postings_amount_cents_check " +
        "the moment a poster runs on it."
    );
  }
  return problems;
}

function run() {
  const text = readFileSync(TARGET, "utf8");
  const problems = check(text);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — copyToAccountingLines excludes $0 container lines from bill_lines/expense_lines.`);
}

function selftest() {
  const real = readFileSync(TARGET, "utf8");
  const failures = [];

  const baseline = check(real);
  if (baseline.length) failures.push(`baseline (real fixed file) should pass, got: ${baseline.join(" | ")}`);

  // Offender: remove the total_cost <> 0 filter (the original bug — copies $0 container lines).
  const offender = real.replace(
    /(      WHERE (?:l\.)?work_order_uuid = \$1\n)(\s*--[^\n]*\n)*\s*AND (?:l\.)?total_cost <> 0\n/,
    "$1"
  );
  if (offender === real) {
    failures.push("offender mutation did not change the file — the guard's own regex may be stale.");
  }
  const p = check(offender);
  if (!p.some((m) => m.includes("does not exclude total_cost = 0"))) {
    failures.push(`offender (missing total_cost filter) NOT caught: ${p.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — offender caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
