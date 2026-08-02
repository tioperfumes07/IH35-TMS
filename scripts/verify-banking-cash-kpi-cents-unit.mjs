#!/usr/bin/env node
/**
 * BANK-F01 / AUDIT row 2 — Cash posting KPI must not double-convert dollars.
 *
 * History:
 * - #3997: backend returned cents → frontend divided by 100 before money.format.
 * - #4011: backend returns dollars (authoritativeTotalCash / 100) → frontend must NOT divide again.
 *
 * This guard fails closed on either side drifting alone: raw cents assigned in the API payload,
 * or a stale frontend /100 after the API already converted.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ROUTE = "apps/backend/src/banking/banking.routes.ts";
const LABEL = "verify-banking-cash-kpi-cents-unit";

export function auditPage(src) {
  const problems = [];
  const re = /const\s+(cashPosting)\s*=\s*Number\(([^)]*?\btotal_cash\b[^)]*?)\)([^;\n]*)/g;
  const matches = [...src.matchAll(re)];
  if (matches.length === 0) {
    problems.push(
      `${PAGE}: no cashPosting selector reads total_cash — re-point this guard at the live KPI derivation.`
    );
    return problems;
  }
  for (const m of matches) {
    const tail = m[3] ?? "";
    if (/\/\s*100/.test(tail)) {
      problems.push(
        `${PAGE}: \`${m[1]}\` divides total_cash by 100, but the API already returns dollars ` +
          `(authoritativeTotalCash / 100). That double-converts the headline Cash KPI 100× vs tiles.`
      );
    }
  }
  return problems;
}

export function auditRoute(src) {
  const problems = [];
  if (!/sumAuthoritativeDepositoryCashCents/.test(src)) {
    problems.push(
      `${ROUTE}: total_cash must still derive from sumAuthoritativeDepositoryCashCents so tiles and KPI share one source.`
    );
  }
  if (!/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(src)) {
    problems.push(
      `${ROUTE}: total_cash must be authoritativeTotalCash / 100 (dollars). Raw cents in the KPI payload ` +
        `inflates Cash posting 100× vs per-account tile dollars.`
    );
  }
  if (/total_cash:\s*authoritativeTotalCash\s*[,}\n]/.test(src) && !/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(src)) {
    problems.push(`${ROUTE}: total_cash must not assign raw authoritativeTotalCash cents to the KPI payload.`);
  }
  return problems;
}

function auditTree() {
  return [
    ...auditPage(readFileSync(join(ROOT, PAGE), "utf8")),
    ...auditRoute(readFileSync(join(ROOT, ROUTE), "utf8")),
  ];
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  const doubleConvert = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0) / 100;`;
  if (!auditPage(doubleConvert).some((p) => p.includes("double-converts")))
    failures.push("case1 FAIL — frontend /100 after API dollars was NOT caught");

  const fixedPage = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);`;
  if (auditPage(fixedPage).length !== 0) failures.push("case2 FAIL — direct dollar read wrongly flagged");

  const rawCentsRoute = `sumAuthoritativeDepositoryCashCents(); total_cash: authoritativeTotalCash,`;
  if (!auditRoute(rawCentsRoute).some((p) => p.includes("must not assign raw")))
    failures.push("case3 FAIL — raw cents route assignment was NOT caught");

  const goodRoute =
    `sumAuthoritativeDepositoryCashCents(client, companyId); total_cash: authoritativeTotalCash / 100,`;
  if (auditRoute(goodRoute).length !== 0) failures.push("case4 FAIL — dollar route wrongly flagged");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — double /100 caught, dollar API + direct frontend read pass, raw cents rejected`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Cash KPI uses API dollars once (no frontend /100 after backend /100)`);
}

main();
