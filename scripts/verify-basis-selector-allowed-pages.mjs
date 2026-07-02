#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const pagesRoot = path.join(process.cwd(), "apps/frontend/src/pages");

const allowedImportPages = new Set([
  "apps/frontend/src/pages/reports/BalanceSheetPage.tsx",
  "apps/frontend/src/pages/reports/TrialBalancePage.tsx",
  "apps/frontend/src/pages/reports/ProfitLossPage.tsx",
  "apps/frontend/src/pages/reports/ReportsHome.tsx",
  // FIN-19 read-only statements page (flag FINANCE_STATEMENTS_UI_ENABLED, OFF):
  // basis legitimately feeds the P&L/BS/TB queries here. Landed after this
  // allowlist was written and was only ever flagged because this guard never
  // ran (arch-design runner poison-pill, now fixed).
  "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
]);

const deniedPages = [
  "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx",
  "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  "apps/frontend/src/pages/reports/APAgingPage.tsx",
];

function fail(messages) {
  console.error("verify:basis-selector-allowed-pages — FAILED");
  for (const msg of messages) console.error(`- ${msg}`);
  process.exit(1);
}

function collectTsxFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsxFiles(full));
    else if (entry.isFile() && full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = collectTsxFiles(pagesRoot);
const failures = [];
const pagesUsingBasisSelector = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
  const source = fs.readFileSync(file, "utf8");
  const importsBasisSelector = /from\s+["'][^"']*BasisSelector["']/.test(source) || /<BasisSelector\b/.test(source);
  if (!importsBasisSelector) continue;
  pagesUsingBasisSelector.push(rel);
  if (!allowedImportPages.has(rel)) {
    failures.push(`BasisSelector imported on disallowed page: ${rel}`);
  }
}

for (const allowed of allowedImportPages) {
  if (!pagesUsingBasisSelector.includes(allowed)) {
    failures.push(`BasisSelector missing from allowed page: ${allowed}`);
  }
}

for (const denied of deniedPages) {
  const full = path.join(process.cwd(), denied);
  if (!fs.existsSync(full)) continue;
  const source = fs.readFileSync(full, "utf8");
  if (/<BasisSelector\b|from\s+["'][^"']*BasisSelector["']/.test(source)) {
    failures.push(`BasisSelector must not be used in accrual-only report page: ${denied}`);
  }
  if (!/always accrual basis per CPA sign-off/i.test(source)) {
    failures.push(`Missing accrual-only note in: ${denied}`);
  }
}

const iftaCard = path.join(process.cwd(), "apps/frontend/src/components/reports/IftaPreparerCard.tsx");
if (fs.existsSync(iftaCard)) {
  const source = fs.readFileSync(iftaCard, "utf8");
  if (/<BasisSelector\b|from\s+["'][^"']*BasisSelector["']/.test(source)) {
    failures.push("BasisSelector must not be used in IFTA report/card surface");
  }
  if (!/always accrual basis per CPA sign-off/i.test(source)) {
    failures.push("Missing accrual-only note in IFTA report/card surface");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:basis-selector-allowed-pages — OK");
