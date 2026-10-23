#!/usr/bin/env node
/**
 * LV-FUEL-HISTORY-RAW-ISO-DATETIME — Fuel History Date column must use formatDateUS.
 * ROUND 443.250 — also asserts History & savings V3 KPI strip + V3Panel (chrome only).
 * @matrix-built {"modules":["fuel"],"cols":["qbo_chrome"],"leafRe":"^history\\.list$","task":"LV-FUEL-HISTORY-RAW-ISO-DATETIME"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx";
const HISTORY_HOME = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const SAVINGS = "apps/frontend/src/pages/fuel/components/SavingsPanel.tsx";
const LABEL = "verify-fuel-history-transaction-date-display";
const SELFTEST = process.argv.includes("--selftest");

function assertFuelHistoryDate(src) {
  const problems = [];
  if (!/formatDateUS/.test(src) || !/from ["'].*formatDate["']/.test(src)) {
    problems.push(`${FILE}: must import formatDateUS`);
  }
  if (!/key:\s*["']transaction_date["']/.test(src)) {
    problems.push(`${FILE}: must keep transaction_date column`);
  }
  if (!/render:\s*\(row\)\s*=>\s*(?:\(row\.fill_moment_at \? formatDateTimeUS\(row\.fill_moment_at\) : )?formatDateUS\(row\.transaction_date\)/.test(src)) {
    problems.push(`${FILE}: transaction_date column must render via formatDateUS(row.transaction_date)`);
  }
  // bare ParityTable column with no render dumps ISO — forbid that shape for this key
  if (/{\s*key:\s*["']transaction_date["']\s*,\s*label:\s*["']Date["']\s*,\s*sortable:\s*true\s*}/.test(src)) {
    problems.push(`${FILE}: bare transaction_date column without render is forbidden (ISO leak)`);
  }
  return problems;
}

function assertFuelHistoryV3(homeSrc, savingsSrc) {
  const problems = [];
  if (!/data-fuel-history-v3-kpis/.test(homeSrc) || !/V3KpiTile/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: ROUND 443.250 must ship V3KpiTile strip (data-fuel-history-v3-kpis)`);
  }
  if (!/fuel-history-v3-panel/.test(homeSrc) || !/V3Panel/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: ROUND 443.250 must wrap transactions in V3Panel (fuel-history-v3-panel)`);
  }
  if (!/Transactions/.test(homeSrc) || !/Voided/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: History V3 KPI strip must include Transactions + Voided`);
  }
  if (!/data-fuel-savings-v3-kpis/.test(savingsSrc) || !/V3KpiTile/.test(savingsSrc)) {
    problems.push(`${SAVINGS}: ROUND 443.250 must ship V3KpiTile strip (data-fuel-savings-v3-kpis)`);
  }
  if (!/fuel-savings-v3-panel/.test(savingsSrc) || !/V3Panel/.test(savingsSrc)) {
    problems.push(`${SAVINGS}: ROUND 443.250 must wrap detail in V3Panel (fuel-savings-v3-panel)`);
  }
  return problems;
}

const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const homeReal = fs.readFileSync(path.join(ROOT, HISTORY_HOME), "utf8");
const savingsReal = fs.readFileSync(path.join(ROOT, SAVINGS), "utf8");

if (SELFTEST) {
  const bad = real
    .replace(/import \{ formatDateUS \} from ["'][^"']+["'];\n?/, "")
    .replace(
      /{\s*key:\s*["']transaction_date["'][\s\S]*?},/,
      '{ key: "transaction_date", label: "Date", sortable: true },',
    );
  const badHits = assertFuelHistoryDate(bad);
  const goodHits = assertFuelHistoryDate(real);
  if (badHits.length === 0 || goodHits.length !== 0) {
    console.error(`${LABEL} --selftest FAIL`, { badHits, goodHits });
    process.exit(1);
  }

  const v3Cases = [
    {
      name: "drops History V3 KPI marker",
      home: homeReal.replace(/data-fuel-history-v3-kpis/g, "data-fuel-history-gone"),
      savings: savingsReal,
    },
    {
      name: "drops History V3Panel",
      home: homeReal.replace(/fuel-history-v3-panel/g, "fuel-history-gone-panel"),
      savings: savingsReal,
    },
    {
      name: "drops Savings V3 KPI marker",
      home: homeReal,
      savings: savingsReal.replace(/data-fuel-savings-v3-kpis/g, "data-fuel-savings-gone"),
    },
    {
      name: "drops Savings V3Panel",
      home: homeReal,
      savings: savingsReal.replace(/fuel-savings-v3-panel/g, "fuel-savings-gone-panel"),
    },
  ];
  for (const c of v3Cases) {
    const hits = assertFuelHistoryV3(c.home, c.savings);
    if (hits.length === 0) {
      console.error(`${LABEL} --selftest FAIL — ${c.name} should fail`);
      process.exit(1);
    }
  }
  const v3Good = assertFuelHistoryV3(homeReal, savingsReal);
  if (v3Good.length !== 0) {
    console.error(`${LABEL} --selftest FAIL — live History/Savings V3 should pass`, v3Good);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const problems = [...assertFuelHistoryDate(real), ...assertFuelHistoryV3(homeReal, savingsReal)];
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(" -", p);
  process.exit(1);
}
console.log(`${LABEL} PASS — Fuel History Date uses formatDateUS; History & savings V3 chrome present`);
