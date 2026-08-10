#!/usr/bin/env node
/** FACT-S04 — reserve dashboard need-company + honest empty (display only). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s04-reserves-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/factoring/ReserveDashboard.tsx";

function read() {
  return fs.readFileSync(path.join(ROOT, PAGE), "utf8");
}

function assertLive(src) {
  const problems = [];
  if (!src.includes('data-testid="factoring-reserves-need-company"')) problems.push("need-company");
  if (!src.includes('data-testid="factoring-reserves-honest-empty"')) problems.push("honest empty");
  if (!src.includes("ListErrorBanner")) problems.push("ListErrorBanner");
  if (!src.includes("balancesQuery.isError")) problems.push("balances error gate");
  if (!src.includes("enabled: Boolean(companyId)")) problems.push("not company-gated");
  if (!src.includes("getReserveBalances")) problems.push("getReserveBalances");
  return problems;
}

if (SELFTEST) {
  const live = assertLive(read());
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, PAGE);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(pagePath, orig.replace(/data-testid="factoring-reserves-need-company"/, 'data-testid="x"'));
  try {
    if (!assertLive(read()).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
