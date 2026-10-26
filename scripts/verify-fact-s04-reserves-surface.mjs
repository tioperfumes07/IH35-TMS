#!/usr/bin/env node
/**
 * FACT-S04 — the reserve surface states need-company, a failed balances read and an empty result honestly (display only).
 * ROUND 435: retargeted from ReserveDashboard.tsx (retired as a strict duplicate; /factoring/reserves redirects to the
 * Reserve tab) to ReserveTracker.tsx, the surviving surface — which silently rendered nothing on a balances error or an
 * empty result until the same states were carried over.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s04-reserves-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";

function read() {
  return fs.readFileSync(path.join(ROOT, PAGE), "utf8");
}

function assertLive(src) {
  const problems = [];
  // BoardSection uses testId= (renders data-testid at runtime); accept either form.
  if (!/testId="factoring-reserves-need-company"|data-testid="factoring-reserves-need-company"/.test(src)) {
    problems.push("need-company");
  }
  if (!/testId="factoring-reserves-honest-empty"|data-testid="factoring-reserves-honest-empty"/.test(src)) {
    problems.push("honest empty");
  }
  // Fill-not-shell: error may sit inside BoardSection; still must gate on balancesQ.isError + ListErrorState.
  if (!/balancesQ\.isError \? \(/.test(src) || !src.includes("<ListErrorState")) {
    problems.push("balances error gate (ListErrorState)");
  }
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
  const plants = [
    ["need-company", orig.replace(/testId="factoring-reserves-need-company"|data-testid="factoring-reserves-need-company"/, 'testId="x"')],
    ["honest empty", orig.replace(/testId="factoring-reserves-honest-empty"|data-testid="factoring-reserves-honest-empty"/, 'testId="x"')],
    ["error gate", orig.replace(/balancesQ\.isError \? \(/, "false ? (")],
  ];
  for (const [name, planted] of plants) {
    if (planted === orig) {
      console.error(`${LABEL} SELFTEST FAILED: mutation "${name}" did not change the source`);
      process.exit(1);
    }
    if (!assertLive(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught (${name})`);
      process.exit(1);
    }
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
