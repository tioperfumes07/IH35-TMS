#!/usr/bin/env node
/**
 * GUARD — verify-reserve-tracker-outstanding-liability-not-double-scaled
 *
 * THE DEFECT THIS ASSERTS — live-verified 2026-08-28 (Chrome, USMCA, `/factoring/reserve-tracker`):
 * `GET /api/v1/factoring/summary` returns `outstanding_liability_balance` as a plain decimal DOLLAR
 * string ("1850.0000000000000000" — a NUMERIC column, no `_cents` suffix). `FactoringHome.tsx`'s own
 * `fmtCurrency()` renders that field correctly, no `/100` (confirmed correct: $1,850.00, matching the
 * live liability). `ReserveTracker.tsx` rendered the SAME field through `fmtM()` — a helper built for
 * every OTHER KPI on that page, which genuinely are `*_cents` columns (`total_face_cents`,
 * `balance_cents`, `expected_advance_cents`) — silently understating a real factoring liability by
 * 100x: $1,850.00 displayed as $18.50, on the one dashboard whose job is showing factoring risk.
 *
 * WHAT IS ASSERTED: `ReserveTracker.tsx`'s "Outstanding Liability" KPI renders
 * `outstandingLiabilityBalance` through a dollar-only formatter (no `/100`), never through `fmtM`.
 *
 * METHOD: comments/strings stripped before structural assertions. --selftest mutates the REAL source
 * and requires the assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-reserve-tracker-outstanding-liability-not-double-scaled";
const FILE = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function check(sources) {
  const errors = [];
  const raw = sources[FILE] ?? "";
  if (!raw) {
    errors.push(`${FILE}: missing.`);
    return errors;
  }
  const src = stripCommentsAndStrings(raw);

  // 1. A dollar-only formatter (not dividing by 100) must exist.
  if (!/const\s+fmtDollars\s*=\s*\(\s*\w+\s*:\s*number\s*\)\s*=>\s*money\.format\(\s*Number\(\s*\w+\s*\)\s*\|\|\s*0\s*\)/.test(src)) {
    errors.push(
      `${FILE}: no dollar-only formatter (fmtDollars) found — the outstanding-liability field is a ` +
        `plain-dollar API value; formatting it with the cents-dividing fmtM() understates it 100x.`
    );
  }

  // 2. The Outstanding Liability KPI must use the dollar-only formatter, never fmtM.
  //    (matched against RAW source — stripCommentsAndStrings blanks the "Outstanding Liability" label.)
  const kpiMatch = raw.match(/label="Outstanding Liability"[\s\S]{0,80}value=\{(\w+)\(outstandingLiabilityBalance\)\}/);
  if (!kpiMatch) {
    errors.push(`${FILE}: could not find the Outstanding Liability KpiCard's value expression.`);
  } else if (kpiMatch[1] === "fmtM") {
    errors.push(
      `${FILE}: Outstanding Liability KPI renders outstandingLiabilityBalance through fmtM (divides ` +
        `by 100) — that field is already dollars (views.factoring_summary.outstanding_liability_balance, ` +
        `no _cents suffix), so this silently shows 1/100th of the real liability.`
    );
  }

  return errors;
}

function loadAll() {
  const out = {};
  try {
    out[FILE] = readFileSync(FILE, "utf8");
  } catch {
    out[FILE] = "";
  }
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["outstanding liability reverted to fmtM", (s) => ({
      ...s,
      [FILE]: s[FILE].replace('value={fmtDollars(outstandingLiabilityBalance)}', 'value={fmtM(outstandingLiabilityBalance)}'),
    })],
    ["fmtDollars helper deleted", (s) => ({
      ...s,
      [FILE]: s[FILE].replace(/const fmtDollars = \(value: number\) => money\.format\(Number\(value\) \|\| 0\);\n/, ""),
    })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — Reserve Tracker's Outstanding Liability KPI renders the already-dollar API field ` +
    `directly, no double-scaling.`
);
