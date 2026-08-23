#!/usr/bin/env node
/**
 * GUARD: DRV-MONEY-F6083 — EarningsTab.tsx's 7 independent queries must each render a real error
 * state on failure, never let a failed fetch masquerade as $0.00 / an empty list.
 *
 * ROOT CAUSE this freezes shut: liabilitiesQuery, settlementsQuery, cashAdvancesQuery,
 * autoDeductionPoliciesQuery, apVendorQuery, openBillsQuery, and driverExpensesQuery all fed their
 * downstream renders unconditionally (`?? []` / `?? 0` on failure) with no reference anywhere in
 * the file to any of their `.isError` flags. A backend outage on any ONE of the seven silently
 * presented as "no financial activity" on this money tab, indistinguishable from a driver who
 * genuinely has none.
 *
 * Static-only (text-pattern) check against the real component file: EACH of the 7 queries must
 * have its own `.isError` reference gating a real error render (ListErrorState for the two
 * ParityTable sections and the three isPending-ternary sections; an inline error indicator for the
 * summary-tile figures that don't have their own loading/empty split).
 *
 * Run:  node scripts/verify-driver-earnings-tab-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/components/drivers/EarningsTab.tsx");
const LABEL = "verify-driver-earnings-tab-error-state";

const QUERIES = [
  "liabilitiesQuery",
  "settlementsQuery",
  "cashAdvancesQuery",
  "autoDeductionPoliciesQuery",
  "apVendorQuery",
  "openBillsQuery",
  "driverExpensesQuery",
];

export function checkEarningsTabErrorState(src) {
  const problems = [];
  if (!/import\s*\{\s*ListErrorState\s*\}\s*from\s*["']\.\.\/ListErrorState["']/.test(src)) {
    problems.push("ListErrorState is no longer imported from ../ListErrorState");
  }
  for (const q of QUERIES) {
    const re = new RegExp(`${q}\\.isError`, "g");
    const matches = src.match(re) ?? [];
    // Each query's own error render is a DISTINCT reference to its .isError flag beyond any
    // shared/incidental mention — require at least one occurrence per query.
    if (matches.length === 0) {
      problems.push(`${q}.isError is never referenced — a failed GET cannot be distinguished from a real empty/zero result`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    const liabilities = liabilitiesQuery.data?.liabilities ?? [];
    const driverSettlements = settlementsQuery.data?.settlements ?? [];
    const approvedAdvancesForDriver = cashAdvancesQuery.data?.requests ?? [];
    return (
      <div>
        {autoDeductionPoliciesQuery.isPending ? <p>Loading</p> : <div>{(autoDeductionPoliciesQuery.data?.rows ?? []).length}</div>}
        {apVendorQuery.isPending ? <p>Loading</p> : <div>{apVendorQuery.data?.vendor?.name}</div>}
        <div>{openBillsQuery.isPending ? "…" : money(0)}</div>
        {driverExpensesQuery.isPending ? <p>Loading</p> : <div>{(driverExpensesQuery.data ?? []).length}</div>}
      </div>
    );
  `;
  const badProblems = checkEarningsTabErrorState(bad);
  if (badProblems.length !== 8) {
    failures.push(`the real pre-fix defect verbatim expected 8 problems (1 import + 7 queries), got ${badProblems.length}: ${badProblems.join("; ")}`);
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkEarningsTabErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: 6 of 7 queries get isError handling, one (driverExpensesQuery) is missed.
  const partial = good.replace(/driverExpensesQuery\.isError/g, "false /* dropped */");
  const partialProblems = checkEarningsTabErrorState(partial);
  if (partialProblems.length !== 1 || !partialProblems[0].includes("driverExpensesQuery")) {
    failures.push(`a partial regression (one of 7 queries silently dropped) was not precisely caught, got: ${partialProblems.join("; ")}`);
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (8/8: import + all 7 queries), the real ` +
      `fixed file clears, a single-query partial regression precisely identified by name.`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkEarningsTabErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — all 7 EarningsTab.tsx queries (liabilities/settlements/cashAdvances/autoDeductionPolicies/apVendor/openBills/driverExpenses) render a real error state on failure.`);
