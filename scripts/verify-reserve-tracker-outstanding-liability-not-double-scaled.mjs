#!/usr/bin/env node
/**
 * GUARD — verify-reserve-tracker-outstanding-liability-not-double-scaled
 *
 * THE DEFECT THIS ASSERTS — live-verified 2026-08-28 (Chrome, USMCA, `/factoring/reserve-tracker`):
 * `GET /api/v1/factoring/summary` returns `outstanding_liability_balance` as a plain decimal DOLLAR
 * string ("1850.0000000000000000" — a NUMERIC column, no `_cents` suffix). `FactoringHome.tsx`'s own
 * `fmtCurrency()` renders that field correctly, no `/100` (confirmed correct: $1,850.00, matching the
 * live liability). `ReserveTracker.tsx` used to render the SAME field a second time (a duplicate tile)
 * through `fmtM()` — a helper built for every OTHER KPI on that page, which genuinely are `*_cents`
 * columns — silently understating a real factoring liability by 100x: $1,850.00 displayed as $18.50.
 *
 * NEW-19 (2026-09-07): ReserveTracker.tsx's whole duplicate KPI band (including that Outstanding
 * Liability tile) was removed — it was a straight duplicate of FactoringHome.tsx's own band one
 * screen higher, same query, rendered twice in two different card styles. FactoringHome.tsx is now
 * the ONLY renderer of this figure on the Reserve Tracker tab (ReserveTracker.tsx mounts only inside
 * FactoringHome.tsx). This guard is RETARGETED, not retired: it now protects the one surviving
 * surface against the exact same mistake — FactoringHome.tsx mixes true *_cents fields (which IT
 * divides by 100 inline, e.g. `gross_total_cents ?? 0) / 100`) with this one plain-dollar field in
 * the same file, so the same "somebody adds /100 out of habit" risk still exists there.
 *
 * WHAT IS ASSERTED: FactoringHome.tsx's "Outstanding Liability Balance" DrillKpiCard renders
 * `summary?.outstanding_liability_balance` through `fmtCurrency(...)` with NO `/ 100` division.
 *
 * METHOD: comments/strings stripped before structural assertions. --selftest mutates the REAL source
 * and requires the assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-reserve-tracker-outstanding-liability-not-double-scaled";
const FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

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
  void src;

  // The Outstanding Liability Balance DrillKpiCard must render the field through fmtCurrency,
  // with no "/ 100" (or "/100") division applied to it anywhere on that value expression.
  const kpiMatch = raw.match(
    /testId="factoring-kpi-outstanding-liability"[\s\S]{0,200}?value=\{([^}]+)\}/,
  );
  if (!kpiMatch) {
    errors.push(`${FILE}: could not find the Outstanding Liability Balance DrillKpiCard's value expression.`);
  } else {
    const valueExpr = kpiMatch[1];
    if (!/fmtCurrency\(/.test(valueExpr)) {
      errors.push(
        `${FILE}: Outstanding Liability Balance KPI must render through fmtCurrency(...) — found "${valueExpr.trim()}".`,
      );
    }
    if (/\/\s*100\b/.test(valueExpr)) {
      errors.push(
        `${FILE}: Outstanding Liability Balance KPI value expression divides by 100 — that field is ` +
          `already dollars (views.factoring_summary.outstanding_liability_balance, no _cents suffix), ` +
          `so this silently shows 1/100th of the real liability. Found "${valueExpr.trim()}".`,
      );
    }
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
    ["outstanding liability given a /100 division", (s) => ({
      ...s,
      [FILE]: s[FILE].replace(
        'value={summaryQuery.isError ? null : fmtCurrency(summary?.outstanding_liability_balance)}',
        'value={summaryQuery.isError ? null : fmtCurrency(Number(summary?.outstanding_liability_balance ?? 0) / 100)}',
      ),
    })],
    ["outstanding liability reverted off fmtCurrency", (s) => ({
      ...s,
      [FILE]: s[FILE].replace(
        'value={summaryQuery.isError ? null : fmtCurrency(summary?.outstanding_liability_balance)}',
        'value={summaryQuery.isError ? null : String(summary?.outstanding_liability_balance ?? 0)}',
      ),
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
  `${LABEL} PASS — FactoringHome's Outstanding Liability Balance KPI renders the already-dollar API ` +
    `field directly, no double-scaling.`,
);
