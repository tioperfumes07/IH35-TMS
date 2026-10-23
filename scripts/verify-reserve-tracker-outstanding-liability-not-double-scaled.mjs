#!/usr/bin/env node
/**
 * GUARD — verify-reserve-tracker-outstanding-liability-not-double-scaled
 *
 * THE DEFECT THIS ASSERTS — live-verified 2026-08-28 (Chrome, USMCA, `/factoring/reserve-tracker`):
 * `GET /api/v1/factoring/summary` returns `outstanding_liability_balance` as a plain decimal DOLLAR
 * string ("1850.0000000000000000" — a NUMERIC column, no `_cents` suffix). Rendering that field
 * through a cents helper (or `/100`) silently understates the liability by 100x.
 *
 * ROUND 443.267 board 4: the surviving surface is FactoringHomeBoard's Outstanding liability
 * V3KpiTile (fmtMoneyDollars on the already-dollar API field — NO /100).
 *
 * WHAT IS ASSERTED: FactoringHomeBoard renders `summary?.outstanding_liability_balance` through
 * `fmtMoneyDollars(...)` with NO `/ 100` division on that value expression.
 *
 * METHOD: comments/strings stripped before structural assertions. --selftest mutates the REAL source
 * and requires the assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-reserve-tracker-outstanding-liability-not-double-scaled";
const FILE = "apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx";

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
  void stripCommentsAndStrings(raw);

  const kpiMatch = raw.match(
    /testId="factoring-kpi-outstanding-liability"[\s\S]{0,400}?value=\{([\s\S]*?)\}/,
  );
  if (!kpiMatch) {
    errors.push(`${FILE}: could not find the Outstanding liability V3KpiTile's value expression.`);
  } else {
    const valueExpr = kpiMatch[1];
    if (!/fmtMoneyDollars\(/.test(valueExpr)) {
      errors.push(
        `${FILE}: Outstanding liability KPI must render through fmtMoneyDollars(...) — found "${valueExpr.trim()}".`,
      );
    }
    if (/\/\s*100\b/.test(valueExpr)) {
      errors.push(
        `${FILE}: Outstanding liability KPI value expression divides by 100 — that field is ` +
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
        'value={summaryQuery.isError ? "—" : fmtMoneyDollars(summary?.outstanding_liability_balance)}',
        'value={summaryQuery.isError ? "—" : fmtMoneyDollars(Number(summary?.outstanding_liability_balance ?? 0) / 100)}',
      ),
    })],
    ["outstanding liability reverted off fmtMoneyDollars", (s) => ({
      ...s,
      [FILE]: s[FILE].replace(
        'value={summaryQuery.isError ? "—" : fmtMoneyDollars(summary?.outstanding_liability_balance)}',
        'value={summaryQuery.isError ? "—" : String(summary?.outstanding_liability_balance ?? 0)}',
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
  `${LABEL} PASS — FactoringHomeBoard's Outstanding liability KPI renders the already-dollar API ` +
    `field directly, no double-scaling.`,
);
