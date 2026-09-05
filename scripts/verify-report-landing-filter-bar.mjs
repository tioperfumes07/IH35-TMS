#!/usr/bin/env node
// RPT-06 — Guard: every data-bearing report page has an inline ReportFilterBar visible on first load.
// Verifies:
//   1. ReportFilterBar.tsx exists with data-report-filter-bar="inline", date range, search, preset buttons
//   2. Each of the 23+ report pages imports and renders ReportFilterBar
//   3. Each page has data-report-filter-bar="inline" in its source (via the shared component)
//   4. Count of pages with the marker >= 23
//   5. --selftest: remove the marker from one page → FAIL; poison the component → FAIL

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FRONTEND_SRC = join(ROOT, "apps", "frontend", "src");
const COMPONENT_PATH = join(FRONTEND_SRC, "components", "reports", "ReportFilterBar.tsx");
const REPORTS_DIR = join(FRONTEND_SRC, "pages", "reports");

const REPORT_PAGES = [
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
  "DriverQualificationReportPage.tsx",
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
  "SettlementSummaryPage.tsx",
  "TrialBalancePage.tsx",
];

const MIN_PAGE_COUNT = 23;
const MARKER = 'data-report-filter-bar="inline"';

function read(path) {
  return readFileSync(path, "utf-8");
}

class GuardError extends Error {}

function fail(message) {
  throw new GuardError(message);
}

function reportFail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function verifyComponent() {
  if (!existsSync(COMPONENT_PATH)) {
    fail(`ReportFilterBar component not found at ${COMPONENT_PATH}`);
  }
  const src = read(COMPONENT_PATH);

  if (!src.includes(MARKER)) {
    fail(`ReportFilterBar component missing "${MARKER}" marker`);
  }
  if (!src.includes("DatePicker")) {
    fail("ReportFilterBar component missing DatePicker (date range)");
  }
  if (!/search/i.test(src) && !src.includes("onSearchChange")) {
    fail("ReportFilterBar component missing search input");
  }
  // Check for preset buttons: this_week, this_month, last_month, ytd
  for (const preset of ["this_week", "this_month", "last_month", "ytd"]) {
    if (!src.includes(preset)) {
      fail(`ReportFilterBar component missing preset "${preset}"`);
    }
  }
  console.log("OK: ReportFilterBar component verified");
}

function verifyPages() {
  let count = 0;
  const missing = [];

  for (const page of REPORT_PAGES) {
    const pagePath = join(REPORTS_DIR, page);
    if (!existsSync(pagePath)) {
      missing.push(`${page} (file not found)`);
      continue;
    }
    const src = read(pagePath);

    const hasImport = src.includes("ReportFilterBar") && src.includes("reports/ReportFilterBar");
    const hasRender = src.includes("<ReportFilterBar");

    if (!hasImport) {
      missing.push(`${page} (missing import)`);
      continue;
    }
    if (!hasRender) {
      missing.push(`${page} (missing <ReportFilterBar> render)`);
      continue;
    }
    count += 1;
  }

  if (missing.length > 0) {
    fail(`Pages missing ReportFilterBar:\n  ${missing.join("\n  ")}`);
  }
  if (count < MIN_PAGE_COUNT) {
    fail(`Page count ${count} < minimum ${MIN_PAGE_COUNT}`);
  }
  console.log(`OK: ${count} report pages have ReportFilterBar (>= ${MIN_PAGE_COUNT})`);
}

function run() {
  const args = process.argv.slice(2);

  if (args.includes("--selftest")) {
    runSelftest();
    return;
  }

  try {
    verifyComponent();
    verifyPages();
    console.log("PASS: verify-report-landing-filter-bar");
  } catch (e) {
    if (e instanceof GuardError) {
      reportFail(e.message);
    }
    throw e;
  }
}

function runSelftest() {
  console.log("Running selftest...");

  // Selftest 1: Remove the ReportFilterBar render from one page → guard must FAIL
  const testPage = join(REPORTS_DIR, "ProfitLossPage.tsx");
  const original = read(testPage);

  // Temporarily remove the ReportFilterBar render from the page
  const poisoned = original.replace(/<ReportFilterBar[\s\S]*?\/>/, "");
  writeFileSync(testPage, poisoned, "utf-8");

  let selftest1Passed = false;
  try {
    verifyPages();
    console.error("SELFTEST FAIL: guard passed after removing ReportFilterBar from a page (should have failed)");
  } catch (e) {
    if (e instanceof GuardError) {
      console.log("OK: selftest correctly detected missing ReportFilterBar on a page");
      selftest1Passed = true;
    } else {
      throw e;
    }
  }

  // Restore immediately
  writeFileSync(testPage, original, "utf-8");

  if (!selftest1Passed) {
    process.exit(1);
  }

  // Selftest 2: Poison the ReportFilterBar component → guard must FAIL
  const componentOriginal = read(COMPONENT_PATH);
  const poisonedComponent = componentOriginal.replace('data-report-filter-bar="inline"', 'data-report-filter-bar="poisoned"');
  writeFileSync(COMPONENT_PATH, poisonedComponent, "utf-8");

  let selftest2Passed = false;
  try {
    verifyComponent();
    console.error("SELFTEST FAIL: guard passed after poisoning ReportFilterBar component (should have failed)");
  } catch (e) {
    if (e instanceof GuardError) {
      console.log("OK: selftest correctly detected poisoned ReportFilterBar component");
      selftest2Passed = true;
    } else {
      throw e;
    }
  }

  // Restore immediately
  writeFileSync(COMPONENT_PATH, componentOriginal, "utf-8");

  if (!selftest2Passed) {
    process.exit(1);
  }

  console.log("PASS: selftest complete");
}

run();
