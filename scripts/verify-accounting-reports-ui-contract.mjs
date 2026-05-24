#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

try {
  const appPath = "apps/frontend/src/App.tsx";
  const apiPath = "apps/frontend/src/api/reports.ts";
  const homePath = "apps/frontend/src/pages/reports/ReportsHome.tsx";
  const subNavPath = "apps/frontend/src/pages/reports/ReportsSubNav.tsx";
  const categoryHoverPath = "apps/frontend/src/components/reports/CategoryHoverNav.tsx";
  const phaseLinksPath = "apps/frontend/src/components/reports/phase6ReportLinks.ts";
  const arAgingPath = "apps/frontend/src/pages/reports/ARAgingPage.tsx";
  const apAgingPath = "apps/frontend/src/pages/reports/APAgingPage.tsx";
  const packagePath = "package.json";

  const app = `${read(appPath)}\n${fs.existsSync("apps/frontend/src/routes/manifest.tsx") ? read("apps/frontend/src/routes/manifest.tsx") : ""}`;
  const api = read(apiPath);
  const home = read(homePath);
  const subNav = read(subNavPath);
  const categoryHover = read(categoryHoverPath);
  const phaseLinks = read(phaseLinksPath);
  const arAging = read(arAgingPath);
  const apAging = read(apAgingPath);
  const pkg = read(packagePath);

  const routePaths = [
    "/reports/trial-balance",
    "/reports/profit-loss",
    "/reports/balance-sheet",
    "/reports/cash-flow-statement",
  ];
  for (const routePath of routePaths) {
    assertIncludes(app, `path="${routePath}"`, `Missing App route: ${routePath}`);
  }

  const pageImports = [
    "TrialBalancePage",
    "ProfitLossPage",
    "BalanceSheetPage",
    "CashFlowStatementPage",
  ];
  for (const pageImport of pageImports) {
    assertIncludes(app, pageImport, `Missing App import/component reference: ${pageImport}`);
  }

  const apiFns = [
    "getTrialBalanceReport(",
    "getProfitLossReport(",
    "getBalanceSheetReport(",
    "getCashFlowStatementReport(",
    "exportTrialBalanceReport(",
    "exportProfitLossReport(",
    "exportBalanceSheetReport(",
    "exportCashFlowStatementReport(",
    "exportArAging(",
    "exportApAging(",
  ];
  for (const fnName of apiFns) {
    assertIncludes(api, fnName, `Missing reports API contract function: ${fnName}`);
  }

  for (const reportId of ["trial-balance", "profit-loss", "balance-sheet", "cash-flow-statement"]) {
    assertIncludes(home, `["${reportId}"`, `Reports home is missing report quick-link: ${reportId}`);
    assertIncludes(subNav, `{ id: "${reportId}"`, `Reports sub-nav run list missing: ${reportId}`);
    assertIncludes(categoryHover, `{ id: "${reportId}"`, `Category hover nav missing report id: ${reportId}`);
    assertIncludes(phaseLinks, `"${reportId}": "/reports/${reportId}"`, `phase6ReportLinks missing route mapping: ${reportId}`);
  }

  for (const page of [arAging, apAging]) {
    assertIncludes(page, "Export PDF", "AR/AP aging page must include Export PDF action");
    assertIncludes(page, "Export XLSX", "AR/AP aging page must include Export XLSX action");
  }
  assertIncludes(arAging, "exportArAging(", "AR aging page must call exportArAging");
  assertIncludes(apAging, "exportApAging(", "AP aging page must call exportApAging");

  assertIncludes(pkg, '"verify:accounting-reports-ui-contract"', "Missing npm script: verify:accounting-reports-ui-contract");
  assertIncludes(pkg, "npm run verify:accounting-reports-ui-contract", "verify:arch-design must run accounting reports UI contract guard");

  console.log("verify:accounting-reports-ui-contract — OK");
} catch (error) {
  console.error(`verify:accounting-reports-ui-contract — FAILED: ${error.message}`);
  process.exit(1);
}
