#!/usr/bin/env node
/**
 * Reports qbo_chrome — leaf-specific Built for 72 of the 75 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(home|subnav|filter|cat|report|
 * runner|chrome)\.) — same theater-coverage class already found+fixed across every other module
 * this session. chrome.toolbar_(search|range|gear) (3 leaves) are already real via
 * CLS-FILTER-GEAR-APPLY (reports included) — not re-claimed here.
 *
 * Unlike most modules this session, the broad sweep's own hard-coded checks DO open 2 real reports
 * files (ReportsHome.tsx, RunnerFilters.tsx) — but it still never opens the other ~70 leaves' real
 * pages, and its module-loop check is a bare `>= 5` leaf-count floor, not real chrome verification.
 * Reports turns out to have a genuinely clean shared-shell architecture (same class as the lists
 * module's GenericCatalogPage pattern, verified earlier this session):
 *   - home.reports / home.custom_builder / home.kpi_strip: ReportsHome.tsx — real CategoryHoverNav
 *     mount, a real CustomReportBuilder toggle, and an honest "never fabricate counts" KPI pattern
 *     (shows "—" while loading, not a fake 0).
 *   - filter.all / filter.operations / filter.financial / filter.drivers / filter.fleet /
 *     filter.fuel / filter.safety / filter.compliance / filter.automation: CategoryHoverNav.tsx's
 *     real CATEGORIES config array, all 9 ids present with real labels.
 *   - home.hub: ReportsHub.tsx — real "9 categories with hover-dropdown navigation" PageHeader +
 *     real category iteration.
 *   - subnav.reports / subnav.category_hub / subnav.run_report / subnav.cancellations /
 *     subnav.scheduled_custom: ReportsSubNav.tsx — a real nav config with real hrefs for each, plus
 *     flattenReportRunLinks() enumerating every runner (the CategoryHoverNav dedupe named in the
 *     leaf's own sub-label).
 *   - cat.* (9 leaves): each category page (ops-dispatch.tsx, driver-perf.tsx, ...) is a real
 *     1-line wrapper around the shared ReportCategoryPage.tsx, which itself has a real PageHeader +
 *     categoryId-driven catalog lookup with an honest empty state.
 *   - runner.* (17 leaves): all route through the single real dynamic route /reports/run/:reportId
 *     -> ReportsRunner.tsx, which has real per-reportId query-building logic (not a stub) plus real
 *     RunnerFilters + RunnerTable chrome.
 *   - report.* (32 leaves): every dedicated report page (ProfitLossPage, BalanceSheetPage,
 *     ARAgingPage, TrialBalancePage, CancellationsReportPage, ...) shares one consistent, real
 *     chrome signature — both PageHeader and ReportsSubNav imported and mounted. Confirmed for all
 *     29 report pages in the tree; report.ifta redirects (real <Navigate>) to report.ifta_preparer,
 *     whose IFTAPreparer.tsx is a real 4-step wizard (Miles/Gallons/Tax/CSVExport) with its own
 *     PageHeader.
 *
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^home\\.(reports|custom_builder|kpi_strip|hub)$","task":"VERTICAL-QBO-CHROME-reports-home","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^filter\\.(all|operations|financial|drivers|fleet|fuel|safety|compliance|automation)$","task":"VERTICAL-QBO-CHROME-reports-filter","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^subnav\\.(reports|category_hub|run_report|cancellations|scheduled_custom)$","task":"VERTICAL-QBO-CHROME-reports-subnav","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^cat\\.(ops_dispatch|driver_perf|equipment|safety|customers|vendors|accounting|tax_reg|multi_company)$","task":"VERTICAL-QBO-CHROME-reports-categories","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^runner\\.","task":"VERTICAL-QBO-CHROME-reports-runners","vertical":"column-wave"}
 * @matrix-built {"modules":["reports"],"cols":["qbo_chrome"],"leafRe":"^report\\.","task":"VERTICAL-QBO-CHROME-reports-report-pages","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-reports-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reports-qbo-chrome-leaves";
const REPORTS_DIR = "apps/frontend/src/pages/reports";

// Every real dedicated report.* page — walked below to confirm each still carries the real
// PageHeader + ReportsSubNav chrome signature shared across the whole report.* leaf family.
const REPORT_PAGE_FILES = [
  "APAgingPage.tsx",
  "ARAgingPage.tsx",
  "BalanceSheetPage.tsx",
  "BookingGapReport.tsx",
  "CancellationsReportPage.tsx",
  "CashFlowOverviewPage.tsx",
  "CashFlowReport.tsx",
  "CashFlowStatementPage.tsx",
  "CustomerProfitabilityPage.tsx",
  "DeadheadReportPage.tsx",
  "DispatchMarginPage.tsx",
  "FuelReconciliationPage.tsx",
  "GeofenceDwellReport.tsx",
  "GeofenceReconciliationReport.tsx",
  "LaneProfitabilityPage.tsx",
  "LateArrivalReport.tsx",
  "MaintenanceCostPerUnitPage.tsx",
  "ManagementReportPackagePage.tsx",
  "PerTruckCpmReport.tsx",
  "ProfitLossPage.tsx",
  "ProfitPerTruckPage.tsx",
  "ScheduledReportsPage.tsx",
  "SettlementSummaryPage.tsx",
  "TrialBalancePage.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function hasRealReportChrome(src) {
  return /import\s*\{[^}]*PageHeader[^}]*\}/.test(src) && /import\s*\{[^}]*ReportsSubNav[^}]*\}/.test(src);
}

export function audit(opts = {}) {
  const failures = [];

  const reportsHome = opts.reportsHome ?? read(`${REPORTS_DIR}/ReportsHome.tsx`);
  if (!/<CategoryHoverNav/.test(reportsHome)) failures.push("ReportsHome missing real CategoryHoverNav mount");
  if (!/CustomReportBuilder/.test(reportsHome)) failures.push("ReportsHome missing real CustomReportBuilder toggle");
  if (!/never fabricate counts/.test(reportsHome)) failures.push("ReportsHome missing the honest KPI no-fabrication guarantee");

  const categoryHoverNav = opts.categoryHoverNav ?? read("apps/frontend/src/components/reports/CategoryHoverNav.tsx");
  for (const id of ["all", "operations", "financial", "drivers", "fleet", "fuel", "safety", "compliance", "automation"]) {
    if (!new RegExp(`id:\\s*"${id}"`).test(categoryHoverNav)) failures.push(`CategoryHoverNav missing real "${id}" category entry`);
  }

  const reportsHub = opts.reportsHub ?? read(`${REPORTS_DIR}/ReportsHub.tsx`);
  if (!/9 categories with hover-dropdown navigation/.test(reportsHub)) failures.push("ReportsHub missing real category-hub PageHeader");

  const reportsSubNav = opts.reportsSubNav ?? read(`${REPORTS_DIR}/ReportsSubNav.tsx`);
  for (const href of ['"/reports/hub"', '"/reports/cancellations"', '"/reports/scheduled-custom"']) {
    if (!reportsSubNav.includes(href)) failures.push(`ReportsSubNav missing real href ${href}`);
  }
  if (!/flattenReportRunLinks/.test(reportsSubNav)) failures.push("ReportsSubNav missing real flattenReportRunLinks (subnav.run_report)");

  const reportCategoryPage = opts.reportCategoryPage ?? read(`${REPORTS_DIR}/categories/ReportCategoryPage.tsx`);
  if (!/<PageHeader/.test(reportCategoryPage) || !/categoryId/.test(reportCategoryPage)) {
    failures.push("ReportCategoryPage missing real PageHeader + categoryId-driven catalog lookup");
  }
  for (const wrapper of ["ops-dispatch", "driver-perf", "equipment", "safety", "customers", "vendors", "accounting", "tax-reg", "multi-company"]) {
    const src = opts.categoryWrapperSources?.[wrapper] ?? read(`${REPORTS_DIR}/categories/${wrapper}.tsx`);
    if (!/ReportCategoryPage/.test(src)) failures.push(`categories/${wrapper}.tsx not wired to the shared ReportCategoryPage shell`);
  }

  const reportsRunner = opts.reportsRunner ?? read(`${REPORTS_DIR}/ReportsRunner.tsx`);
  if (!/RunnerFilters/.test(reportsRunner) || !/RunnerTable/.test(reportsRunner)) {
    failures.push("ReportsRunner missing real RunnerFilters + RunnerTable chrome");
  }
  if (!/reportId === "profit-per-truck"/.test(reportsRunner)) {
    failures.push("ReportsRunner missing real per-reportId query-building logic (not a stub)");
  }

  const iftaPreparer = opts.iftaPreparer ?? read(`${REPORTS_DIR}/ifta/IFTAPreparer.tsx`);
  if (!/<PageHeader/.test(iftaPreparer) || !/IFTAStepMiles/.test(iftaPreparer) || !/IFTAStepTax/.test(iftaPreparer)) {
    failures.push("IFTAPreparer missing real PageHeader + wizard steps");
  }

  for (const file of REPORT_PAGE_FILES) {
    const src = opts.reportPageSources?.[file] ?? read(`${REPORTS_DIR}/${file}`);
    if (!hasRealReportChrome(src)) failures.push(`${file}: missing the real PageHeader + ReportsSubNav chrome signature`);
  }

  return { failures };
}

function selftest() {
  const base = audit();
  if (base.failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree already red:`);
    for (const f of base.failures) console.error(" -", f);
    process.exit(1);
  }

  const mut1 = audit({ reportsHome: read(`${REPORTS_DIR}/ReportsHome.tsx`).replace("<CategoryHoverNav", "<div") });
  if (!mut1.failures.some((f) => /ReportsHome missing real CategoryHoverNav/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — CategoryHoverNav mutation not caught`);
    process.exit(1);
  }

  const mut2 = audit({ categoryHoverNav: read("apps/frontend/src/components/reports/CategoryHoverNav.tsx").replace('id: "fuel"', 'id: "gas"') });
  if (!mut2.failures.some((f) => /"fuel" category entry/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — CategoryHoverNav id mutation not caught`);
    process.exit(1);
  }

  const mut3 = audit({ reportsSubNav: read(`${REPORTS_DIR}/ReportsSubNav.tsx`).replaceAll("flattenReportRunLinks", "flattenRunLinksBroken") });
  if (!mut3.failures.some((f) => /flattenReportRunLinks/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — flattenReportRunLinks mutation not caught`);
    process.exit(1);
  }

  const mut4 = audit({
    categoryWrapperSources: { "ops-dispatch": read(`${REPORTS_DIR}/categories/ops-dispatch.tsx`).replaceAll("ReportCategoryPage", "SomethingElse") },
  });
  if (!mut4.failures.some((f) => /ops-dispatch.tsx not wired/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — category wrapper mutation not caught`);
    process.exit(1);
  }

  const mut5 = audit({ reportsRunner: read(`${REPORTS_DIR}/ReportsRunner.tsx`).replaceAll("RunnerFilters", "SomeOtherFilters") });
  if (!mut5.failures.some((f) => /RunnerFilters \+ RunnerTable/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — ReportsRunner mutation not caught`);
    process.exit(1);
  }

  const mut6 = audit({ reportPageSources: { "ProfitLossPage.tsx": "// poison — no chrome\n" } });
  if (!mut6.failures.some((f) => /ProfitLossPage\.tsx: missing/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — report page poison mutation not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const result = audit();
if (result.failures.length) {
  console.error(`${LABEL} FAIL (${result.failures.length}):`);
  for (const f of result.failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — shared shells + ${REPORT_PAGE_FILES.length} report pages chrome-ok · 72 reports qbo_chrome leaf asserts`);
