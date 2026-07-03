#!/usr/bin/env node
/**
 * verify-da-pool-compliance — SM2 Drug & Alcohol random-pool guard.
 *
 * Locks two compliance invariants so they cannot silently regress:
 *
 *  1. FMCSA 49 CFR 382.305 quarterly draw rates. A carrier drawing 4×/year must
 *     select 50% ÷ 4 = 12.5% (drug) and 10% ÷ 4 = 2.5% (alcohol) per quarter to
 *     attain the annual minimums. Every `targetDrugPct = <n>` default in the random
 *     pool service must be >= 12.5 (annualized under-testing = FMCSA audit failure),
 *     and the pre-fix 10 default must not reappear. Alcohol defaults must be >= 2.5.
 *
 *  2. The bulk pool-enrollment action (root-cause fix for the empty-pool defect)
 *     must exist in the Drug & Alcohol tab — an empty consortium pool means the
 *     random draw has no population.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const failures = [];

// ── 1. Draw-rate defaults ──────────────────────────────────────────────────────
const serviceRel = "apps/backend/src/safety/drug-alcohol/random-pool.service.ts";
const servicePath = path.join(repoRoot, serviceRel);
if (!fs.existsSync(servicePath)) {
  failures.push(`${serviceRel} (missing — cannot verify draw rates)`);
} else {
  const src = fs.readFileSync(servicePath, "utf8");

  const drugDefaults = [...src.matchAll(/targetDrugPct\s*=\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const alcoholDefaults = [...src.matchAll(/targetAlcoholPct\s*=\s*([\d.]+)/g)].map((m) => Number(m[1]));

  if (drugDefaults.length === 0) {
    failures.push(`${serviceRel} (no targetDrugPct default found)`);
  }
  for (const pct of drugDefaults) {
    if (pct < 12.5) {
      failures.push(
        `${serviceRel} (targetDrugPct default ${pct} < 12.5 — annualized ${pct * 4}% is under the 50% federal minimum, 49 CFR 382.305(b)(2))`
      );
    }
  }
  // Negative test against the pre-fix 10/10 defaults.
  if (drugDefaults.includes(10)) {
    failures.push(`${serviceRel} (pre-fix targetDrugPct = 10 default reintroduced)`);
  }
  for (const pct of alcoholDefaults) {
    if (pct < 2.5) {
      failures.push(
        `${serviceRel} (targetAlcoholPct default ${pct} < 2.5 — under the 10% annual alcohol minimum, 49 CFR 382.305(b)(1))`
      );
    }
  }
}

// ── 2. Bulk enrollment action in the tab ───────────────────────────────────────
const tabRel = "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx";
const tabPath = path.join(repoRoot, tabRel);
if (!fs.existsSync(tabPath)) {
  failures.push(`${tabRel} (missing — cannot verify bulk enrollment)`);
} else {
  const tab = fs.readFileSync(tabPath, "utf8");
  if (!tab.includes("bulkEnrollRandomPool")) {
    failures.push(`${tabRel} (missing bulkEnrollRandomPool wiring — empty-pool defect can recur)`);
  }
  if (!/Enroll all/.test(tab)) {
    failures.push(`${tabRel} (missing the bulk "Enroll all … active CDL drivers" action)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-da-pool-compliance] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-da-pool-compliance] OK (draw rates >= 12.5/2.5, bulk enrollment present)");
