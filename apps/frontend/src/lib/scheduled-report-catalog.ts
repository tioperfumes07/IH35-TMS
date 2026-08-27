// SCHEDULED-REPORTS-EDIT-REPORT-FIELD-BLANK-UNKNOWN-ID: single source of truth for the "system"
// report_id -> display-label catalog shared by ScheduledReportsPage.tsx (list-row label formatting)
// and ScheduleReportModal.tsx (the "Report" select's option catalog). Before this, each file kept its
// own independent, drifted list -- ScheduledReportsPage.tsx knew about 6 preset-driven ids
// (dispatch-board/cash-position-ar/profit-per-truck-week/settlements-ready/maintenance-open-wos/
// ifta-quarterly-state) that ScheduleReportModal.tsx's own `extraReports` list never learned about, so
// editing any of the 6 real live schedules using one of those ids showed the Report field blank
// ("Select...") in the Edit modal even though every other field (frequency/time/day/subject) correctly
// pre-filled. Additive-only: extend this dict, never remove a live report_id from it.
export const SCHEDULED_REPORT_LABELS: Record<string, string> = {
  "dispatch-board": "Dispatch board",
  "cash-position-ar": "Cash position / A/R",
  "profit-per-truck-week": "Profit per truck (week)",
  "settlements-ready": "Settlements ready",
  "maintenance-open-wos": "Maintenance open WOs",
  "ifta-quarterly-state": "IFTA quarterly by state",
  "cash-flow-overview": "Cash flow overview",
  "settlement-summary": "Settlement summary",
  "customer-profitability": "Customer profitability",
  "profit-per-truck": "Profit per truck",
  "fuel-reconciliation": "Fuel reconciliation",
  "maintenance-cost-per-unit": "Maintenance cost per unit",
  "ar-aging": "A/R aging",
  "ap-aging": "A/P aging",
};
