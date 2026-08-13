#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function walkTsx(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walkTsx(full, out);
      continue;
    }
    if (!/\.tsx$/.test(entry.name)) continue;
    if (/\.test\.tsx$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function hasRawOperatingCompanyId(src) {
  // A report page must never display a raw operating_company_id UUID to the operator.
  // API params use the bare key (operating_company_id: ...); only display sites use the dotted accessor.
  const code = stripComments(src);
  return /\.operating_company_id\b/.test(code);
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
  const scheduleModalPath = "apps/frontend/src/pages/reports/ScheduleReportModal.tsx";
  const geofenceReportPath = "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx";
  const iftaPreparerPath = "apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx";
  const packagePath = "package.json";

  const app = `${read(appPath)}\n${fs.existsSync("apps/frontend/src/routes/manifest.tsx") ? read("apps/frontend/src/routes/manifest.tsx") : ""}`;
  const api = read(apiPath);
  const home = read(homePath);
  const subNav = read(subNavPath);
  const categoryHover = read(categoryHoverPath);
  const phaseLinks = read(phaseLinksPath);
  const arAging = read(arAgingPath);
  const apAging = read(apAgingPath);
  const scheduleModal = read(scheduleModalPath);
  const geofenceReport = read(geofenceReportPath);
  const iftaPreparer = read(iftaPreparerPath);
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
    // CLS-FILTER-GEAR-APPLY — as-of DatePicker must draft; queryKey uses appliedAsOf only after Apply.
    assertIncludes(page, "appliedAsOf", "AR/AP aging must stage as-of date (appliedAsOf) before refetch");
    assertIncludes(page, "setAppliedAsOf(asOf)", "AR/AP aging must Apply staged as-of date");
  }
  assertIncludes(arAging, "exportArAging(", "AR aging page must call exportArAging");
  assertIncludes(apAging, "exportApAging(", "AP aging page must call exportApAging");

  const cashFlowOverviewPath = "apps/frontend/src/pages/reports/CashFlowOverviewPage.tsx";
  const cashFlowOverview = read(cashFlowOverviewPath);
  assertIncludes(cashFlowOverview, "appliedAsOf", "Cash flow overview must stage as-of date (appliedAsOf)");
  assertIncludes(cashFlowOverview, "setAppliedAsOf(asOf)", "Cash flow overview must Apply staged as-of date");

  const geofenceReconPath = "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx";
  const geofenceRecon = read(geofenceReconPath);
  assertIncludes(geofenceRecon, "appliedDate", "Geofence recon must stage report date (appliedDate)");
  assertIncludes(geofenceRecon, "setAppliedDate(date)", "Geofence recon must Apply staged report date");
  assertIncludes(scheduleModal, "option.name", "ScheduleReportModal must render report name, not raw id");
  assertIncludes(scheduleModal, "selectedReportName", "ScheduleReportModal must submit a human-readable report name");
  assertIncludes(geofenceReport, "entityLabel(null, f.geofence_id", "GeofenceReconciliationReport must label geofence_id, not render raw UUID");
  assertIncludes(iftaPreparer, "STATUS_LABELS[row.status]", "IftaPreparer must map filing status to a human label");

  const reportsDir = "apps/frontend/src/pages/reports";
  for (const file of walkTsx(reportsDir)) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    if (hasRawOperatingCompanyId(read(file))) {
      throw new Error(`${rel}: raw operating_company_id UUID visible to operator — use a human label or EntityLink`);
    }
  }

  assertIncludes(pkg, '"verify:accounting-reports-ui-contract"', "Missing npm script: verify:accounting-reports-ui-contract");
  assertIncludes(pkg, "npm run verify:accounting-reports-ui-contract", "verify:arch-design must run accounting reports UI contract guard");

  console.log("verify:accounting-reports-ui-contract — OK");
} catch (error) {
  console.error(`verify:accounting-reports-ui-contract — FAILED: ${error.message}`);
  process.exit(1);
}
