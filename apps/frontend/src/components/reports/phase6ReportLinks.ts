/** Block U + W: dedicated Phase 6 report routes — keep in sync with App.tsx and CategoryHoverNav. */
export const PHASE_6_REPORT_HREFS: Record<string, string> = {
  "cash-flow-overview": "/reports/cash-flow-overview",
  "settlement-summary": "/reports/settlement-summary",
  "customer-profitability": "/reports/customer-profitability",
  "profit-per-truck": "/reports/profit-per-truck",
  "fuel-reconciliation": "/reports/fuel-reconciliation",
  "maintenance-cost-per-unit": "/reports/maintenance-cost-per-unit",
  "scheduled-reports": "/reports/scheduled",
};

export function phase6ReportHref(reportId: string): string | undefined {
  return PHASE_6_REPORT_HREFS[reportId];
}
