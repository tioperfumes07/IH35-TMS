#!/usr/bin/env node
// COMPANY-WATERFALL-FUEL-EXPENSE-SPLIT (owner 2026-09-09, settlement redesign item 9), corrected
// same day after a live-caught scope bug: the driver settlement detail page's Company Waterfall card
// carried one combined "Costs (Additional + Fuel + Company expenses)" line with an honest "not yet
// split" placeholder. The first fix pass rendered Fuel/Company-expenses from the company-scoped
// report ALONGSIDE readout.company_settlement's Invoiced/Driver/Costs -- which turned out to be
// TOUR-scoped despite the field name (tour-readout.routes.ts computes company_settlement.* from just
// this one tour's own legs), so any company settlement covering more than one driver settlement
// produced a nonsensical negative "Other costs" remainder (live-caught on CS-2026-0002, 2 driver
// settlements). Fixed for real by rendering the ENTIRE waterfall from the company-scoped `report`
// once it has loaded (Invoiced/every pl_rollup line/Fuel/Expenses/Net, the exact same fields
// SettlementsCompanyDriverTab.tsx's already-correct inline waterfall uses), falling back to the old
// tour-scoped combined-Costs line only while the report hasn't loaded yet -- one consistent scope,
// never both mixed.
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

export function waterfallRendersFromReportSectionsOnly(src) {
  // Every waterfall figure in the report-loaded branch must come from report.sections.* -- never
  // mixed with readout.company_settlement's tour-scoped costs_cents/revenue_cents/driver_pay_cents
  // inside that same branch (the exact regression this guard exists to catch).
  const reportBranchStart = src.indexOf("if (report) {");
  const reportBranchEnd = src.indexOf("return (", src.indexOf("return (", reportBranchStart) + 1);
  if (reportBranchStart === -1 || reportBranchEnd === -1) return false;
  const reportBranch = src.slice(reportBranchStart, reportBranchEnd);
  const usesReportFields =
    /report\.sections\.revenue\.invoiced_cents/.test(reportBranch) &&
    /report\.sections\.pl_rollup\.lines\.map/.test(reportBranch) &&
    /report\.sections\.pl_rollup\.net_revenue_cents/.test(reportBranch) &&
    /report\.sections\.fuel_purchases\.total_cents/.test(reportBranch) &&
    /report\.sections\.expenses\.total_cents/.test(reportBranch);
  const mixesTourScopedFields = /cs\.(revenue_cents|driver_pay_cents|costs_cents|margin_cents)/.test(reportBranch);
  return usesReportFields && !mixesTourScopedFields;
}

function violations(files) {
  const errors = [];
  if (!detailPageFetchesAndPassesReport(files.detailPage)) {
    errors.push("SettlementDetailPage.tsx no longer fetches getCompanySettlementReport and passes it to CompanyWaterfallSection");
  }
  if (!waterfallRendersFromReportSectionsOnly(files.waterfall)) {
    errors.push("CompanyWaterfallSection.tsx's report-loaded branch no longer renders every figure from report.sections (or reintroduced a mix with readout.company_settlement's tour-scoped fields -- the exact scope-mismatch bug this guard exists to prevent)");
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
    { ...files, waterfall: files.waterfall.replace("report.sections.fuel_purchases.total_cents", "cs.costs_cents") },
    { ...files, waterfall: files.waterfall.replace("report.sections.pl_rollup.net_revenue_cents", "cs.margin_cents") },
    {
      // the exact regression: mixing a tour-scoped field into the report-loaded branch
      ...files,
      waterfall: files.waterfall.replace(
        '<span className="ldt-m">{money(report.sections.expenses.total_cents)}</span>',
        '<span className="ldt-m">{money(report.sections.expenses.total_cents - cs.driver_pay_cents)}</span>'
      ),
    },
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
  console.log(`${LABEL} PASS -- the driver settlement detail page's Company Waterfall renders every figure from the single company-scoped report once it has loaded, never mixed with the tour-scoped readout fields`);
}
