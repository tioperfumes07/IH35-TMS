# AUTO-10 — Reports module: present vs missing

**Verdict: foundation + core financial/ops reports SHIPPED (#155/#264). A few year-end/regulatory reports remain.**

## Present (repo report pages)
- APAgingPage
- ARAgingPage
- BalanceSheetPage
- BookingGapReport
- CancellationsReportPage
- CashFlowOverviewPage
- CashFlowReport
- CashFlowStatementPage
- CustomerProfitabilityPage
- CustomReportBuilder
- DeadheadReportPage
- DispatchMarginPage
- FuelReconciliationPage
- GeofenceDwellReport
- GeofenceReconciliationReport
- LaneProfitabilityPage
- LateArrivalReport
- MaintenanceCostPerUnitPage
- PerTruckCpmReport
- ProfitLossPage
- ProfitPerTruckPage
- ReportBlockTPendingBanner
- ReportBlockVPendingBanner
- ReportsHome
- ReportsHub
- ReportsRunner
- ScheduledReportsBackendPendingBanner
- ScheduledReportsPage
- ScheduledReportsPanel
- SettlementSummaryPage
- SubscriptionManager
- TrialBalancePage

Plus the financial set wired in ReportsSubNav: Profit & Loss, Balance Sheet, Cash Flow Statement, Cash Flow
Overview, AR Aging, AP Aging, Customer Profitability, Trip Profitability, Cancellations, Booking Gap, IFTA
(quarterly preparer), and the Audit report pages (Reports > Audit, A8).

## Genuinely MISSING (no report page; tracked elsewhere)
- **1099** annual vendor report (BLOCK-24, tracker row 600) — PENDING.
- **Form 425C** Chapter-11 DIP monthly exhibits A–F (GAP-44) — PENDING.
- **Multi-entity consolidation** statements (BLOCK-25, row 601) — PENDING.
- **Scheduled-report auto-email** (6 reports per Q8 / GAP-43) — partial (ScheduleReportModal exists; the
  send/cron coverage to confirm).

## Action
None built here. The missing set above is the precise reports gap; each is its own future block (1099/425C are
Tier-1 tax/regulatory). Docs-only enumeration.
