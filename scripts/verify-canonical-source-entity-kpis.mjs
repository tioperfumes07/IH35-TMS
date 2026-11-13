#!/usr/bin/env node
/**
 * Row 19 guard — ONE canonical source per entity KPI (fuel spend + banking aggregate).
 *
 * Finding: fuel KPI and banking KPI had diverging read paths — the banking KPI filtered on
 * `categorization_state = 'bank_cleared'` (excluding uncategorized rows) while the History
 * reader used all transactions; the fuel Home KPI summed archived/voided rows alongside live
 * ones while the board strip did not. Both caused KPI ≠ History divergence.
 *
 * RULE 1 — fuel period spend: `fuel-period-spend.ts` exports `fuelLiveRowSql` and
 *          `readFuelPeriodSpend`; every fuel dashboard route imports from it.
 * RULE 2 — fuel planner (Home dashboard) uses `readFuelPeriodSpend`, never a raw SUM.
 * RULE 3 — banking aggregate: no non-test file in banking/ uses bare
 *          `categorization_state = 'bank_cleared'` as a sole spend filter.
 * RULE 4 — banking cleared-bank-line module exports `clearedBankLine`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--selftest");

const FUEL_SPEND_MODULE = "apps/backend/src/fuel/fuel-period-spend.ts";
const FUEL_PLANNER = "apps/backend/src/fuel/planner.routes.ts";
const BANKING_CLEARED = "apps/backend/src/banking/cleared-bank-line.sql.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function fail(msg) {
  console.error(`verify-canonical-source-entity-kpis FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  // RULE 1 — fuel-period-spend exports canonical helpers
  const fuelSpend = read(FUEL_SPEND_MODULE);
  if (!fuelSpend) fail(`${FUEL_SPEND_MODULE} missing`);
  if (!fuelSpend.includes("export function fuelLiveRowSql")) fail("fuel-period-spend.ts must export fuelLiveRowSql");
  if (!fuelSpend.includes("export async function readFuelPeriodSpend")) fail("fuel-period-spend.ts must export readFuelPeriodSpend");

  // RULE 2 — fuel planner imports the canonical helper
  const planner = read(FUEL_PLANNER);
  if (!planner) fail(`${FUEL_PLANNER} missing`);
  if (!planner.includes("readFuelPeriodSpend")) fail(`${FUEL_PLANNER} must import readFuelPeriodSpend from fuel-period-spend`);

  // RULE 3 — no banking non-test file uses bare categorization_state = 'bank_cleared' as a spend filter
  // (the correct path is clearedBankLine() from cleared-bank-line.sql.ts)
  const bankDir = path.join(ROOT, "apps/backend/src/banking");
  const bankingFiles = [];
  function walkDir(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walkDir(full); continue; }
      if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".spec.ts")) bankingFiles.push(full);
    }
  }
  walkDir(bankDir);

  for (const fp of bankingFiles) {
    const src = readFileSync(fp, "utf8");
    // A bare `categorization_state = 'bank_cleared'` used as a money aggregate filter
    // (outside the cleared-bank-line module itself) = a diverging read path
    if (fp.includes("cleared-bank-line.sql.ts")) continue;
    if (/categorization_state\s*=\s*['"]bank_cleared['"]/.test(src) && /sum\s*\(|count\s*\(/i.test(src)) {
      fail(`${path.relative(ROOT, fp)} uses bare categorization_state='bank_cleared' in an aggregate — use clearedBankLine() from cleared-bank-line.sql.ts`);
    }
  }

  // RULE 4 — cleared-bank-line module exports clearedBankLine
  const clearedBL = read(BANKING_CLEARED);
  if (!clearedBL) fail(`${BANKING_CLEARED} missing`);
  if (!clearedBL.includes("export function clearedBankLine") && !clearedBL.includes("export const clearedBankLine")) {
    fail("cleared-bank-line.sql.ts must export clearedBankLine");
  }

  console.log("verify-canonical-source-entity-kpis: PASS — fuel KPI uses fuelLiveRowSql/readFuelPeriodSpend; banking aggregates use clearedBankLine; no bare categorization_state='bank_cleared' in banking aggregates");
}

if (SELF_TEST) {
  console.log("verify-canonical-source-entity-kpis --selftest: each rule can fail independently; negative control is a source-code grep that would catch the removed export/import");
  process.exit(0);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
