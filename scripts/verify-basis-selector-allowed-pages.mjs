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
  // RPT-PAR-1: management report package page — basis selector drives P&L/BS/TB
  // sub-report rendering within the package view.
  "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  // ACCT-CASHFLOW-BASIS-LOCK-CONFLICT (owner ruling 2026-09-05, "cash flow should always have cash and
  // accrual selector, as in QuickBooks"): the accrual-only lock on this ONE page is deliberately
  // LIFTED here, by design, in the same PR that adds the real selector — this is exactly the visible,
  // deliberate policy change this guard's own design intent (see the module docstring precedent this
  // list already follows) exists to make impossible to do silently. ARAgingPage/APAgingPage below are
  // NOT touched — a separate, still-standing owner decision (cash-basis/engine.ts Q4/Q8).
  "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx",
]);

const deniedPages = [
  "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  "apps/frontend/src/pages/reports/APAgingPage.tsx",
];

const ownerPolicySurfaces = [
  ...deniedPages,
  "apps/frontend/src/components/reports/IftaPreparerCard.tsx",
  "apps/frontend/src/pages/reports/ifta/IFTAPreparer.tsx",
];

export function auditOwnerPolicyCopy(sources) {
  const problems = [];
  for (const rel of ownerPolicySurfaces) {
    const source = sources[rel] ?? "";
    if (!/accrual basis under the owner-locked reporting policy/i.test(source)) {
      problems.push(`Missing owner-locked accrual-basis note in: ${rel}`);
    }
    if (/CPA\s+(?:sign-?off|approval|tie-?out)/i.test(source)) {
      problems.push(`Stale CPA authority copy remains in: ${rel}`);
    }
  }
  return problems;
}

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
}

const iftaCard = path.join(process.cwd(), "apps/frontend/src/components/reports/IftaPreparerCard.tsx");
if (fs.existsSync(iftaCard)) {
  const source = fs.readFileSync(iftaCard, "utf8");
  if (/<BasisSelector\b|from\s+["'][^"']*BasisSelector["']/.test(source)) {
    failures.push("BasisSelector must not be used in IFTA report/card surface");
  }
}

const ownerPolicySources = Object.fromEntries(
  ownerPolicySurfaces.map((rel) => [rel, fs.readFileSync(path.join(process.cwd(), rel), "utf8")]),
);
failures.push(...auditOwnerPolicyCopy(ownerPolicySources));

if (process.argv.includes("--selftest")) {
  for (const rel of ownerPolicySurfaces) {
    const mutant = {
      ...ownerPolicySources,
      [rel]: ownerPolicySources[rel].replace(
        /accrual basis under the owner-locked reporting policy/gi,
        "accrual basis per CPA sign-off",
      ),
    };
    const planted = auditOwnerPolicyCopy(mutant);
    if (!planted.some((problem) => problem.includes(rel))) {
      failures.push(`SELFTEST inert — stale CPA mutation escaped for ${rel}`);
    }
  }
}

if (failures.length > 0) fail(failures);
console.log(
  process.argv.includes("--selftest")
    ? `verify:basis-selector-allowed-pages — SELFTEST OK (${ownerPolicySurfaces.length} stale-authority mutations rejected)`
    : "verify:basis-selector-allowed-pages — OK",
);
