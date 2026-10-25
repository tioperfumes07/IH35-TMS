#!/usr/bin/env node
/**
 * LV-FUEL-HISTORY-RAW-ISO-DATETIME — Fuel History Date column must use formatDateUS.
 * ROUND 443.250 — History & savings V3 KPI strips.
 * ROUND 443.326 — History roster = board grammar (MoneyListToolbar + FuelTransactionsTable),
 * not a V3Panel wrap around the table.
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
  // 443.326 — full board, not panel-wrapped roster theater.
  if (!/fuel-history-v3-board/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: ROUND 443.326 must mount History board (fuel-history-v3-board)`);
  }
  if (!/\bMoneyListToolbar\b/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: ROUND 443.326 History board must mount MoneyListToolbar`);
  }
  if (!/\bFuelTransactionsTable\b/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: ROUND 443.326 History roster must mount FuelTransactionsTable`);
  }
  if (/fuel-history-v3-panel/.test(homeSrc) && /<V3Panel[\s>]/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: ROUND 443.326 must not wrap History roster in V3Panel`);
  }
  if (!/Transactions/.test(homeSrc) || !/Voided/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: History V3 KPI strip must include Transactions + Voided`);
  }
  // ROUND 443.280 — one KPI row; forbid pagination tiles on History/Fills.
  if (/label=["']This page["']/.test(homeSrc) || /label=["']Page size["']/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: must not render pagination KPIs This page / Page size (443.280)`);
  }
  if (!/FuelBoardSection/.test(homeSrc) || !/fuel-history-fills-board-section/.test(homeSrc)) {
    problems.push(`${HISTORY_HOME}: History fills roster must wrap in FuelBoardSection (fuel-history-fills-board-section)`);
  }
  if (!/data-fuel-savings-v3-kpis/.test(savingsSrc) || !/V3KpiTile/.test(savingsSrc)) {
    problems.push(`${SAVINGS}: ROUND 443.250 must ship V3KpiTile strip (data-fuel-savings-v3-kpis)`);
  }
  if (!/fuel-savings-v3-panel/.test(savingsSrc) || !/FuelBoardSection/.test(savingsSrc)) {
    problems.push(`${SAVINGS}: ROUND 443.326 must wrap detail in FuelBoardSection (fuel-savings-v3-panel)`);
  }
  if (/import\\s*\\{[^}]*\\bV3Panel\\b|<\\s*V3Panel\\b/.test(savingsSrc)) {
    problems.push(`${SAVINGS}: ROUND 443.326 must not import/use V3Panel`);
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
      name: "drops History board marker",
      home: homeReal.replace(/fuel-history-v3-board/g, "fuel-history-gone-board"),
      savings: savingsReal,
    },
    {
      name: "drops History MoneyListToolbar",
      home: homeReal.replace(/\bMoneyListToolbar\b/g, "GoneToolbar"),
      savings: savingsReal,
    },
    {
      name: "drops Savings V3 KPI marker",
      home: homeReal,
      savings: savingsReal.replace(/data-fuel-savings-v3-kpis/g, "data-fuel-savings-gone"),
    },
    {
      name: "drops Savings FuelBoardSection",
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
console.log(`${LABEL} PASS — Fuel History Date uses formatDateUS; History board + savings V3 chrome present`);
