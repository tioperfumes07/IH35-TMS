#!/usr/bin/env node
// Guard (MANUAL-PROJECTIONS-V2 Part A): the Manual Daily Projections totals must sum
// amount_cents as INTEGER CENTS, never via the JS string-concatenation bug that turned
// $6,500 + $5,500 into $6,500,005,500. Locks in the fix: the Tab routes all totals
// through manualProjectionMath (Number-coerced), and never re-introduces the raw
// `reduce((s, e) => s + e.amount_cents)` concat pattern.
import { readFileSync } from "node:fs";

const TAB = "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx";
const MATH = "apps/frontend/src/pages/cash-flow/tabs/manualProjectionMath.ts";
const TEST = "apps/frontend/src/pages/cash-flow/tabs/manualProjectionMath.test.ts";

const failures = [];
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`${p}: missing`);
    return "";
  }
};

const tab = read(TAB);
const math = read(MATH);
const test = read(TEST);

// The buggy concat pattern must be gone from the Tab.
if (/reduce\(\(\s*s\s*,\s*e\s*\)\s*=>\s*s\s*\+\s*e\.amount_cents/.test(tab)) {
  failures.push(`${TAB}: raw string-concat sum of e.amount_cents reintroduced (summing bug)`);
}
// Tab must source its totals from the tested math module.
if (!/from "\.\/manualProjectionMath"/.test(tab) || !/computeProjectionTotals|sumCents/.test(tab)) {
  failures.push(`${TAB}: must import sums from manualProjectionMath (computeProjectionTotals/sumCents)`);
}
// Math module must coerce to Number before summing.
if (!/Number\(/.test(math) || !/reduce\(/.test(math)) {
  failures.push(`${MATH}: sumCents must Number-coerce before reduce`);
}
// The regression test must assert the canonical case.
if (!/1200000/.test(test) || !/650000550000/.test(test)) {
  failures.push(`${TEST}: must assert 650000+550000 === 1200000 and not 650000550000`);
}

if (failures.length) {
  console.error("verify:manual-projection-sum — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:manual-projection-sum — OK ($6,500 + $5,500 = $12,000, integer-cents)");
