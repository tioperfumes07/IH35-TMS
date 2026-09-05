#!/usr/bin/env node
// DISPATCH-1 guard (owner order 2026-09-05): the default GET /api/v1/mdata/units list path — the one
// every unit picker reads (EntityPicker kind=unit, Book Load, inline board pickers) — must exclude
// soft-deleted units (deactivated_at) and archive statuses (Sold/Transferred/Damaged) unless the
// caller explicitly opts in via include_inactive. Without this, a Sold+deactivated dupe like
// "U-156-provisional" appears beside the live unit and an operator can pick a retired truck.
//
// Static guard: asserts the exclusion block is present, gated on !include_inactive, on the units list
// route. Read-only exclusion (void-not-delete) — the guard does NOT require the rows be removed.
//
// Usage: node scripts/verify-unit-picker-excludes-archived-deactivated.mjs [--selftest]

import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/mdata/units.routes.ts";

const CONTRACTS = [
  {
    id: "gated-on-include-inactive",
    re: /if\s*\(\s*!\s*include_inactive\s*\)\s*\{/,
    msg: "the archive/deactivated exclusion must be gated on `if (!include_inactive)` so Fleet's view-archived toggle still works",
  },
  {
    id: "excludes-deactivated",
    re: /filters\.push\(\s*["'`]deactivated_at IS NULL["'`]\s*\)/,
    msg: 'the list path must push "deactivated_at IS NULL" when !include_inactive',
  },
  {
    id: "excludes-archive-statuses",
    re: /status NOT IN \('Sold',\s*'Transferred',\s*'Damaged'\)/,
    msg: "the list path must exclude ('Sold','Transferred','Damaged') statuses when !include_inactive",
  },
];

function audit(src) {
  const failures = [];
  for (const c of CONTRACTS) {
    if (!c.re.test(src)) failures.push(`${c.id}: ${c.msg}`);
  }
  // The exclusion must sit before the LIMIT/OFFSET pager on the default path (i.e. inside the WHERE
  // filters array, not dead code): require the deactivated filter to appear before the ORDER BY.
  const deIdx = src.indexOf('"deactivated_at IS NULL"');
  const orderIdx = src.indexOf("ORDER BY created_at DESC, id DESC");
  if (deIdx !== -1 && orderIdx !== -1 && deIdx > orderIdx) {
    failures.push(
      "deactivated_at filter appears after the default-list ORDER BY — it is not wired into the WHERE clause",
    );
  }
  return failures;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(FILE, "utf8");

  const failures = audit(src);
  if (failures.length) {
    console.error(`FAIL verify-unit-picker-excludes-archived-deactivated (${FILE}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  if (selftest) {
    // Mutation 1: remove the include_inactive gate — must fail.
    const mutated1 = src.replace(/if\s*\(\s*!\s*include_inactive\s*\)\s*\{/, "if (false) {");
    if (audit(mutated1).length === 0) {
      console.error("SELFTEST FAIL: removing the include_inactive gate did not trip the guard");
      process.exit(1);
    }
    // Mutation 2: drop the deactivated filter — must fail.
    const mutated2 = src.replace(/filters\.push\(\s*["'`]deactivated_at IS NULL["'`]\s*\)/, "void 0");
    if (audit(mutated2).length === 0) {
      console.error("SELFTEST FAIL: dropping the deactivated_at filter did not trip the guard");
      process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on both mutations");
  }

  console.log("PASS verify-unit-picker-excludes-archived-deactivated");
}

main();
