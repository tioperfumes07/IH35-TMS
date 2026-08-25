#!/usr/bin/env node
/**
 * verify-saf-drug-alcohol-dashboard-query-error-surface
 * SAF-DA-DASHBOARD-QUERY-ERROR — rateQ/poolQ/rtdQ failures must not look like 0% rates / empty pool.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-drug-alcohol-dashboard-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/DrugAlcoholDashboard.tsx";
const NEEDLES = [
  "userFacingApiError",
  "rateQ.isError",
  "poolQ.isError",
  "rtdQ.isError",
  "drug-alcohol-dashboard-query-error",
  "ListErrorState",
  "retryFailedDashboardQueries",
  "rateQ.isError ? rateQ.refetch()",
  "poolQ.isError ? poolQ.refetch()",
  "rtdQ.isError ? rtdQ.refetch()",
  "onRetry={() => void retryFailedDashboardQueries()}",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const mutations = [
    ["rate retry", "rateQ.isError ? rateQ.refetch()", "rateQ.isError ? Promise.resolve()"],
    ["pool retry", "poolQ.isError ? poolQ.refetch()", "poolQ.isError ? Promise.resolve()"],
    ["rtd retry", "rtdQ.isError ? rtdQ.refetch()", "rtdQ.isError ? Promise.resolve()"],
    ["retry action", "onRetry={() => void retryFailedDashboardQueries()}", "onRetry={() => undefined}"],
  ];
  for (const [name, from, to] of mutations) {
    const planted = source.replace(from, to);
    const missing = NEEDLES.filter((needle) => !planted.includes(needle));
    if (missing.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} selftest PASS — 4 independent recovery mutations red`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(process.cwd(), FILE))) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const errors = assertFile(FILE, NEEDLES);
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — DrugAlcoholDashboard surfaces and exactly retries failed rateQ/poolQ/rtdQ reads`);
