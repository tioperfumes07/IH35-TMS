#!/usr/bin/env node
// COMPANY-WATERFALL-FUEL-EXPENSE-SPLIT (owner 2026-09-09, settlement redesign item 9): the driver
// settlement detail page's Company Waterfall card carried one combined "Costs (Additional + Fuel +
// Company expenses)" line with an honest "not yet split" placeholder, even though the split already
// exists in company-settlement-report.service.ts (the same read model
// SettlementsCompanyDriverTab.tsx's itemized-by-load view already uses for real Fuel/Expenses
// numbers). Fixed by having SettlementDetailPage.tsx fetch that report too and pass it to
// CompanyWaterfallSection, which now renders Fuel Purchases + Company Expenses as real lines plus an
// honest "Other costs" remainder (never assumed zero) when the report has loaded, falling back to the
// old combined line while it hasn't. No new GL math -- pure re-plumbing of an existing correct total.
//
// Usage: node scripts/verify-company-waterfall-fuel-expense-split.mjs [--selftest]
import fs from "node:fs";

const LABEL = "verify-company-waterfall-fuel-expense-split";
const DETAIL_PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const WATERFALL = "apps/frontend/src/pages/driver-finance/components/CompanyWaterfallSection.tsx";

export function detailPageFetchesAndPassesReport(src) {
  return (
    /import \{ getCompanySettlementReport \} from "\.\.\/\.\.\/api\/accounting";/.test(src) &&
    /queryKey: \["company-settlement-report", companyId, companySettlementId\]/.test(src) &&
    /<CompanyWaterfallSection readout=\{readout\} report=\{companyReport\}/.test(src)
  );
}

export function waterfallRendersRealFuelAndExpenseLines(src) {
  return (
    /const fuelCents = report\?\.\s*sections\.fuel_purchases\.total_cents/.test(src) &&
    /const expensesCents = report\?\.\s*sections\.expenses\.total_cents/.test(src) &&
    /data-testid="waterfall-fuel-purchases"/.test(src) &&
    /data-testid="waterfall-company-expenses"/.test(src) &&
    // the honest-remainder line must be derived, never a bare literal 0 or omitted
    /otherCostsCents =[\s\S]{0,80}cs\.costs_cents - fuelCents - expensesCents/.test(src)
  );
}

function violations(files) {
  const errors = [];
  if (!detailPageFetchesAndPassesReport(files.detailPage)) {
    errors.push("SettlementDetailPage.tsx no longer fetches getCompanySettlementReport and passes it to CompanyWaterfallSection");
  }
  if (!waterfallRendersRealFuelAndExpenseLines(files.waterfall)) {
    errors.push("CompanyWaterfallSection.tsx no longer renders real Fuel Purchases/Company Expenses lines from the report, or dropped the honest Other-costs remainder derivation");
  }
  return errors;
}

function check(files) {
  const errors = violations(files);
  if (errors.length) throw new Error(errors.join("; "));
}

function loadFiles() {
  return {
    detailPage: fs.readFileSync(DETAIL_PAGE, "utf8"),
    waterfall: fs.readFileSync(WATERFALL, "utf8"),
  };
}

const files = loadFiles();

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    { ...files, detailPage: files.detailPage.replace('<CompanyWaterfallSection readout={readout} report={companyReport} />', '<CompanyWaterfallSection readout={readout} />') },
    { ...files, detailPage: files.detailPage.replace('import { getCompanySettlementReport } from "../../api/accounting";', "") },
    { ...files, waterfall: files.waterfall.replace('data-testid="waterfall-fuel-purchases"', 'data-testid="removed"') },
    { ...files, waterfall: files.waterfall.replace('data-testid="waterfall-company-expenses"', 'data-testid="removed"') },
    { ...files, waterfall: files.waterfall.replace("cs.costs_cents - fuelCents - expensesCents", "0") },
  ];
  for (const mutated of mutations) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(files);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(files);
  console.log(`${LABEL} PASS -- the driver settlement detail page's Company Waterfall renders real Fuel Purchases/Company Expenses lines instead of the old combined-costs placeholder`);
}
