#!/usr/bin/env node
// PARITY-SORT-COMPUTED-COLUMN-NO-OP — guard
//
// Same root cause as PARITY-EXPORT-COMPUTED-COLUMN-BLANK, for sorting instead of export:
// ParityTable's sort falls back to raw `row[key]` when a column has no `sortValue`. Where `key`
// doesn't match any real row property, every row's extracted value is `undefined`, so every
// pairwise comparison hits the nulls-equal branch and returns 0 — clicking the sortable header
// toggles the arrow but the row order never changes. Confirmed in ModuleCompletionPage.tsx:
// "u14" (row.u14 is an OBJECT — partial no-op, every defined row stringifies identically and
// compares equal) and "open" (no matching field at all — complete no-op). Each now has a
// sortValue reusing the exact resolver its own render already calls.
//
// A sibling instance (ItemsListPage.tsx, 5 columns) was also found but is NOT fixed here — that
// file lives under apps/frontend/src/pages/lists/accounting/, which this repo's
// verify-no-money-theater guard classifies as financial-cluster (requires the ACCT-F## finding
// ID + full DoD-A..E/VERIFY-1..8 template, not this mechanical-lane's shape). Filed to
// docs/audit/GUARD-WORKORDERS.md as LISTS-ITEMS-CATALOG-SORT-NO-OP for the money lane.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MODULE_COMPLETION_FILE = "apps/frontend/src/pages/program/ModuleCompletionPage.tsx";

export function check(text) {
  const failures = [];

  if (!/sortValue: \(row\) => row\.u14\?\.status \?\? null/.test(text)) {
    failures.push(`${MODULE_COMPLETION_FILE} "u14" column no longer has sortValue`);
  }
  if (!/sortValue: \(row\) => \(row\.defined \? row\.total - row\.done : null\)/.test(text)) {
    failures.push(`${MODULE_COMPLETION_FILE} "open" column no longer has sortValue`);
  }

  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, MODULE_COMPLETION_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: parity-sort-computed-column-no-op");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: ModuleCompletionPage's computed sortable columns (u14, open) have sortValue");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, MODULE_COMPLETION_FILE), "utf8");

  const offenderA = text.replace("\n        sortValue: (row) => row.u14?.status ?? null,", "");
  if (offenderA === text) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderA).length === 0) {
    console.error("FAIL(selftest): planted offender (u14 sortValue removed) was NOT caught");
    process.exit(1);
  }

  const offenderB = text.replace(
    "\n        sortValue: (row) => (row.defined ? row.total - row.done : null),",
    ""
  );
  if (offenderB === text) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderB).length === 0) {
    console.error("FAIL(selftest): planted offender (open sortValue removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
