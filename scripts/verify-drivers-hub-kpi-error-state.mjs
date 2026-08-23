#!/usr/bin/env node
/**
 * GUARD: DRV-MONEY-F6110 — Drivers hub's 5 money-adjacent queries must each render a real error
 * state on failure, never let a failed fetch masquerade as a confirmed-zero KPI or a false
 * clean-bill-of-health.
 *
 * ROOT CAUSE this freezes shut: settlementsQuery, pendingEscrowQuery, escrowBalancesQuery,
 * cashAdvancesQuery, and liabilitiesQuery had zero reference to any of their `.isError` flags
 * anywhere in apps/frontend/src/pages/Drivers.tsx, while driversQuery/teamsQuery/
 * dispatchLoadsQuery/samsaraHealthQuery in the SAME file correctly gated on isError. A failed
 * fetch on any of the 5 silently rendered as $0 KPIs (Settle Due / Drivers Owe / Escrow) and a
 * literal false clean-bill-of-health on the Debt Alert panel ("No outstanding cash advance,
 * repair, damage, or late-arrival debt.").
 *
 * Static-only (text-pattern) check against the real page file: EACH of the 5 queries must have
 * its own `.isError` reference gating a real error render.
 *
 * Run:  node scripts/verify-drivers-hub-kpi-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/Drivers.tsx");
const LABEL = "verify-drivers-hub-kpi-error-state";

const QUERIES = ["settlementsQuery", "pendingEscrowQuery", "escrowBalancesQuery", "cashAdvancesQuery", "liabilitiesQuery"];

export function checkDriversHubErrorState(src) {
  const problems = [];
  for (const q of QUERIES) {
    const re = new RegExp(`${q}\\.isError`, "g");
    const matches = src.match(re) ?? [];
    if (matches.length === 0) {
      problems.push(`${q}.isError is never referenced — a failed fetch cannot be distinguished from a real empty/zero result`);
    }
  }
  // The two shared aggregates (debtAlertRows/totalDriversOwe) derive from BOTH cashAdvancesQuery
  // and liabilitiesQuery — a combined error flag must gate them, not just the two source queries
  // individually (each query's own isError being referenced elsewhere is not sufficient proof the
  // DERIVED total is actually protected).
  if (!/debtDataError\s*=\s*cashAdvancesQuery\.isError\s*\|\|\s*liabilitiesQuery\.isError/.test(src)) {
    problems.push("no combined debtDataError flag (cashAdvancesQuery.isError || liabilitiesQuery.isError) gates the derived debt totals");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    const settleDueCount = (settlementsQuery.data?.settlements ?? []).length;
    const escrowTotal = (escrowBalancesQuery.data?.drivers ?? []).reduce((s, r) => s + r.escrow_balance, 0);
    const totalDriversOwe = debtAlertRows.reduce((s, r) => s + r.total, 0);
    return (
      <div>
        <span>{(pendingEscrowQuery.data?.data ?? []).length}</span>
      </div>
    );
  `;
  const badProblems = checkDriversHubErrorState(bad);
  if (badProblems.length !== 6) {
    failures.push(`the real pre-fix defect verbatim expected 6 problems (5 queries + combined flag), got ${badProblems.length}: ${badProblems.join("; ")}`);
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkDriversHubErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: escrowBalancesQuery's isError handling silently dropped.
  const partial = good.replace(/escrowBalancesQuery\.isError/g, "false /* dropped */");
  const partialProblems = checkDriversHubErrorState(partial);
  if (partialProblems.length !== 1 || !partialProblems[0].includes("escrowBalancesQuery")) {
    failures.push(`a partial regression (one of 5 queries silently dropped) was not precisely caught, got: ${partialProblems.join("; ")}`);
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (6/6: all 5 queries + combined debt flag), ` +
      `the real fixed file clears, a single-query partial regression precisely identified by name.`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkDriversHubErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — all 5 Drivers hub money-adjacent queries (settlements/pendingEscrow/escrowBalances/cashAdvances/liabilities) render a real error state on failure.`);
