#!/usr/bin/env node
// U6 (owner, 2026-10-03) — "Checks list must show all checks with full filters". Static.
//   1. GET /api/v1/checks/all unions every check: expense checks, bills paid by check, driver settlements paid by check
//   2. the Checks page reads it and filters type / status / bank account (multi-select), payee search, date range
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";


if (process.argv.includes("--selftest")) selftest();

const LABEL = "verify-checks-list-shows-every-check";
const fails = [];
const route = readFileSync("apps/backend/src/accounting/checks/checks.routes.ts", "utf8");
const all = route.slice(route.indexOf('"/api/v1/checks/all"'));
for (const [re, msg] of [
  [/e\.payment_type = 'check'/, "expense checks"],
  [/bp\.payment_method = 'check'/, "bills paid by check"],
  [/r\.source_kind = 'driver_settlement_payment'/, "driver settlements paid by check"],
]) if (!re.test(all.slice(0, 4000))) fails.push(`/api/v1/checks/all no longer includes ${msg}`);
const page = readFileSync("apps/frontend/src/pages/accounting/checks/CheckListPage.tsx", "utf8");
if (!/listAllChecks\(/.test(page)) fails.push("the Checks page no longer reads every check (listAllChecks)");
for (const id of ["checks-filter-kind", "checks-filter-status", "checks-filter-bank"]) {
  if (!page.includes(`data-testid="${id}"`)) fails.push(`the Checks page lost the ${id} filter`);
}
// Search lives on MoneyListToolbar via searchTestId (renders data-testid="checks-search" at runtime).
if (!page.includes('searchTestId="checks-search"') && !page.includes('data-testid="checks-search"')) {
  fails.push("the Checks page lost the checks-search filter");
}
// ACCT-F443293-C — V3 board grammar: MoneyListToolbar + kpiStrip (no ad-hoc filter chrome theater).
if (!page.includes("MoneyListToolbar")) fails.push("the Checks page lost MoneyListToolbar (FILTER-MULTI-01)");
if (!page.includes("kpiStrip=") || !page.includes('data-testid="checks-kpi-strip"') || !page.includes("moneyListKpiCard")) {
  fails.push("the Checks page must pass AccountingSubNavWrapper kpiStrip with checks-kpi-strip + moneyListKpiCard");
}
if (page.includes("CollapsedListFilters")) fails.push("the Checks page must not use CollapsedListFilters");
// 443.293-C — bare rounded card → BoardSection register chrome.
if (!/<BoardSection[\s\S]{0,220}testId=["']checks-list-board["']/.test(page)) {
  fails.push("the Checks page must wrap the register in BoardSection (checks-list-board)");
}
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — the Checks list shows every check (expense, bill payment, driver settlement) with full filters`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-checks-list-shows-every-check", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
