# ParityTable Migration Tracker

**Goal:** migrate the hand-rolled `<table>` implementations in `apps/frontend/src` onto the shared
QBO-parity grid (`apps/frontend/src/components/parity/ParityTable.tsx`) so every list inherits the same
resize / sticky-header / density / CSV-export / column-chooser / paging behavior — **without weakening**
the four CI-enforced resize guards:
`verify-tables-use-resizable-th`, `verify-table-controls-shared`, `verify-planner-universal-grid`,
`verify-parity-table-resize-sort-contract`.

Migration rule (§7 additive-only): **preserve every existing column, order, custom field**
(Settlement No, Truck No, Pickup/Delivery Date, SB-Load No, Empty/Loaded Miles, Work Order),
sort, and the lock-account control — never drop or reorder.

## Status legend
- **migrated (batch 1)** — moved onto ParityTable in this PR.
- **financial-hold** — file lives in a financial module (`accounting/*`, `banking/*`, `lists/*`,
  factoring, driver-finance, finance, liabilities, cash-flow, cash-advances, profitability, qbo,
  payroll-integration, form425c, ap). Per CLAUDE.md §1.4 these are **Jorge-gated — do not migrate autonomously**.
- **pending** — non-financial, eligible for a future migration batch.

## Rollup
| Status | Count |
| --- | --- |
| migrated (batch 1) | 8 |
| financial-hold (Jorge-gated) | 100 |
| pending (non-financial, future batches) | 192 |
| **hand-rolled total (original)** | **300** |

> Note: ParityTable was already consumed by ~16 surfaces before this batch (not counted above — those were never hand-rolled).

## Batch 1 — migrated (this PR)
Added two **additive** props to `ParityTable` — `tableTestId` and `rowTestId` — so a migrated page keeps the container/row `data-testid` hooks its former hand-rolled table carried (existing unit tests pass unchanged).

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx` | pages/dispatch |
| `apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx` | pages/dispatch |
| `apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx` | pages/dispatch |
| `apps/frontend/src/pages/safety/CompanyViolationsPage.tsx` | pages/safety |
| `apps/frontend/src/pages/safety/PermitsPage.tsx` | pages/safety |
| `apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx` | pages/safety |
| `apps/frontend/src/pages/safety/TrainingProgramsPage.tsx` | pages/safety |
| `apps/frontend/src/pages/safety/TrainingRecordsPage.tsx` | pages/safety |

## Remaining hand-rolled inventory (by module)

### components/DataTable.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/DataTable.tsx` | pending |

### components/FleetTable.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/FleetTable.tsx` | pending |

### components/allocation (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/allocation/AllocationPreviewTable.tsx` | pending |

### components/ap (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/components/ap/BillPaymentModal.tsx` | financial-hold |

### components/assets (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/assets/AssetListTable.tsx` | pending |

### components/audit (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/audit/AuditHistoryTab.tsx` | pending |
| `apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx` | pending |

### components/catalogs (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/catalogs/CatalogTable.tsx` | pending |

### components/compliance (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/compliance/ComplianceTable.tsx` | pending |
| `apps/frontend/src/components/compliance/NotificationLogPanel.tsx` | pending |
| `apps/frontend/src/components/compliance/NotificationRulesPanel.tsx` | pending |

### components/customers (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx` | pending |

### components/dispatch (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/dispatch/AccessorialEditor.tsx` | pending |
| `apps/frontend/src/components/dispatch/DispatchList.tsx` | pending |

### components/driver-profile (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/driver-profile/DocumentsSection.tsx` | pending |
| `apps/frontend/src/components/driver-profile/SettlementsSection.tsx` | pending |
| `apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx` | pending |

### components/drivers (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/drivers/AuditHistoryTab.tsx` | pending |
| `apps/frontend/src/components/drivers/EarningsTab.tsx` | pending |
| `apps/frontend/src/components/drivers/LoadHistoryTab.tsx` | pending |
| `apps/frontend/src/components/drivers/OperationsHistoryTable.tsx` | pending |

### components/factoring (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/components/factoring/FaroCSVUploadWidget.tsx` | financial-hold |

### components/forms (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx` | pending |

### components/home (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/home/DriverDaySummaryCard.tsx` | pending |

### components/insurance (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/insurance/PolicyCreateWizard.tsx` | pending |

### components/lists (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/components/lists/ListView/ListView.tsx` | financial-hold |

### components/maintenance (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/maintenance/LaborTracker.tsx` | pending |
| `apps/frontend/src/components/maintenance/PositionedPartPicker.tsx` | pending |

### components/reports (5)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/reports/FrequentlyRunTable.tsx` | pending |
| `apps/frontend/src/components/reports/LaneDetailModal.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx` | pending |

### components/shared (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/shared/MobileOptimizedTable.tsx` | pending |
| `apps/frontend/src/components/shared/ResizableTable.tsx` | pending |

### components/trailer-profile (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/trailer-profile/PlatesTable.tsx` | pending |
| `apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx` | pending |

### components/vehicle-profile (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/vehicle-profile/ComplianceSection.tsx` | pending |
| `apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx` | pending |
| `apps/frontend/src/components/vehicle-profile/PlatesTable.tsx` | pending |
| `apps/frontend/src/components/vehicle-profile/RecentActivitySection.tsx` | pending |

### pages/CustomerDetail.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/CustomerDetail.tsx` | pending |

### pages/Customers.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/Customers.tsx` | pending |

### pages/DriverDetail.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/DriverDetail.tsx` | pending |

### pages/VendorDetail.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/VendorDetail.tsx` | pending |

### pages/Vendors.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/Vendors.tsx` | pending |

### pages/accounting (43) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/AccountRegisterPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/BillsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/CashForecastPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/CoaRolesPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/DailyReconPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/EscrowPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/FactorReserveCard.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/FactoringDetailPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/FactoringListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/FixedAssetsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/InvoicesListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/ManualJEListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/MonthClosePage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/MyAccountantPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PayBillModal.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PaymentDetailPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PaymentsListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PayrollAggregatedPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PeriodComparisonPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PostingLineagePage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/QBOSyncDriftDashboard.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/QboReconciliationPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/ReceiptsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/SalesTaxPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx` | financial-hold |
| `apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx` | financial-hold |

### pages/admin (6)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/admin/ActivityLogPage.tsx` | pending |
| `apps/frontend/src/pages/admin/ErrorMonitor.tsx` | pending |
| `apps/frontend/src/pages/admin/LaunchToggles.tsx` | pending |
| `apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx` | pending |
| `apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx` | pending |
| `apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx` | pending |

### pages/audit (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/audit/AuditEventsList.tsx` | pending |
| `apps/frontend/src/pages/audit/AuditTrailPage.tsx` | pending |

### pages/banking (9) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/banking/BankAccountDetail.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/CashGlSetupPage.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/TransfersListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/components/RegisterTable.tsx` | financial-hold |
| `apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx` | financial-hold |

### pages/cash-advances (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx` | financial-hold |

### pages/cash-flow (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx` | financial-hold |

### pages/compliance (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx` | pending |
| `apps/frontend/src/pages/compliance/Form2290Filings.tsx` | pending |
| `apps/frontend/src/pages/compliance/HosTrackerSection.tsx` | pending |
| `apps/frontend/src/pages/compliance/HosViewerSection.tsx` | pending |

### pages/customers (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/customers/CustomerCOITab.tsx` | pending |
| `apps/frontend/src/pages/customers/CustomersListView.tsx` | pending |
| `apps/frontend/src/pages/customers/components/PortalUsersTab.tsx` | pending |
| `apps/frontend/src/pages/customers/tabs/CoiRequestsTab.tsx` | pending |

### pages/daily-tasks (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx` | pending |

### pages/dev (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/dev/BulkDemoPage.tsx` | pending |

### pages/dispatch (21)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/DispatchBoard.tsx` | pending |
| `apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx` | pending |
| `apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/LoadCancellationsReportPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/OcrQueuePage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/PodReviewPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx` | pending |
| `apps/frontend/src/pages/dispatch/TripProfitability.tsx` | pending |
| `apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx` | pending |
| `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx` | pending |
| `apps/frontend/src/pages/dispatch/components/LoadTable.tsx` | pending |
| `apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx` | pending |
| `apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx` | pending |
| `apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx` | pending |
| `apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx` | pending |
| `apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx` | pending |

### pages/docs (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/docs/DocsHomePage.tsx` | pending |

### pages/driver-finance (7) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx` | financial-hold |

### pages/drivers (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/drivers/DriverImportModal.tsx` | pending |
| `apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx` | pending |
| `apps/frontend/src/pages/drivers/DriversTable.tsx` | pending |
| `apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx` | pending |

### pages/factoring (9) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/factoring/BatchDetail.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/BatchWizard.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/ChargebacksTable.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/FactorAdmin.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/FactoringHome.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/FaroImportPage.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/RecoursePipelineTable.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/ReserveDashboard.tsx` | financial-hold |
| `apps/frontend/src/pages/factoring/ReserveTracker.tsx` | financial-hold |

### pages/finance (5) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/finance/AmortizationPage.tsx` | financial-hold |
| `apps/frontend/src/pages/finance/ArApAgingPage.tsx` | financial-hold |
| `apps/frontend/src/pages/finance/CalculatorPage.tsx` | financial-hold |
| `apps/frontend/src/pages/finance/FinancialStatementsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/finance/LoanWizardPage.tsx` | financial-hold |

### pages/form425c (2) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx` | financial-hold |
| `apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx` | financial-hold |

### pages/fuel (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx` | pending |
| `apps/frontend/src/pages/fuel/components/StopReasoningTable.tsx` | pending |
| `apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx` | pending |

### pages/home (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/home/DriverHubReportingPage.tsx` | pending |

### pages/insurance (6)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/insurance/ClaimsTab.tsx` | pending |
| `apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx` | pending |
| `apps/frontend/src/pages/insurance/LawsuitsTab.tsx` | pending |
| `apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx` | pending |
| `apps/frontend/src/pages/insurance/PolicyDetail.tsx` | pending |
| `apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx` | pending |

### pages/integrations (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx` | pending |

### pages/legal (5)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx` | pending |
| `apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx` | pending |
| `apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx` | pending |
| `apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx` | pending |
| `apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx` | pending |

### pages/liabilities (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx` | financial-hold |

### pages/lists (11) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/accounting/QBOBulkLinkPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/components/QboSyncHealthCard.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/names/NamesMasterHub.tsx` | financial-hold |

### pages/maintenance (18)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/FaultRulesPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx` | pending |
| `apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/TireProgramPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/VendorDetailPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/brakes/BrakeWearDashboard.tsx` | pending |
| `apps/frontend/src/pages/maintenance/compliance/Compliance425CPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/components/CreateWOSectionReconcile.tsx` | pending |
| `apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx` | pending |
| `apps/frontend/src/pages/maintenance/reports/MaintenanceReportsPage.tsx` | pending |
| `apps/frontend/src/pages/maintenance/units/UnitBrakesTab.tsx` | pending |

### pages/operations (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/operations/GeofencesPage.tsx` | pending |

### pages/payroll-integration (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/payroll-integration/PayrollAggregateTable.tsx` | financial-hold |

### pages/profitability (4) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/profitability/ByCustomerView.tsx` | financial-hold |
| `apps/frontend/src/pages/profitability/ByLaneView.tsx` | financial-hold |
| `apps/frontend/src/pages/profitability/ByLoadView.tsx` | financial-hold |
| `apps/frontend/src/pages/profitability/ByTypeView.tsx` | financial-hold |

### pages/qbo (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx` | financial-hold |

### pages/qbo-sync-detail (2) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/qbo-sync-detail/ConflictsTab.tsx` | financial-hold |
| `apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx` | financial-hold |

### pages/reports (26)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/reports/APAgingPage.tsx` | pending |
| `apps/frontend/src/pages/reports/ARAgingPage.tsx` | pending |
| `apps/frontend/src/pages/reports/BalanceSheetPage.tsx` | pending |
| `apps/frontend/src/pages/reports/BookingGapReport.tsx` | pending |
| `apps/frontend/src/pages/reports/CancellationsReportPage.tsx` | pending |
| `apps/frontend/src/pages/reports/CashFlowStatementPage.tsx` | pending |
| `apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx` | pending |
| `apps/frontend/src/pages/reports/DeadheadReportPage.tsx` | pending |
| `apps/frontend/src/pages/reports/DispatchMarginPage.tsx` | pending |
| `apps/frontend/src/pages/reports/FuelReconciliationPage.tsx` | pending |
| `apps/frontend/src/pages/reports/GeofenceDwellReport.tsx` | pending |
| `apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx` | pending |
| `apps/frontend/src/pages/reports/LaneProfitabilityPage.tsx` | pending |
| `apps/frontend/src/pages/reports/LateArrivalReport.tsx` | pending |
| `apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx` | pending |
| `apps/frontend/src/pages/reports/PerTruckCpmReport.tsx` | pending |
| `apps/frontend/src/pages/reports/ProfitLossPage.tsx` | pending |
| `apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx` | pending |
| `apps/frontend/src/pages/reports/ScheduledReportsPage.tsx` | pending |
| `apps/frontend/src/pages/reports/SettlementSummaryPage.tsx` | pending |
| `apps/frontend/src/pages/reports/TrialBalancePage.tsx` | pending |
| `apps/frontend/src/pages/reports/audit/AuditReportPage.tsx` | pending |
| `apps/frontend/src/pages/reports/ifta/IFTAStepGallons.tsx` | pending |
| `apps/frontend/src/pages/reports/ifta/IFTAStepMiles.tsx` | pending |
| `apps/frontend/src/pages/reports/ifta/IFTAStepTax.tsx` | pending |
| `apps/frontend/src/pages/reports/runners/RunnerTable.tsx` | pending |

### pages/safety (32)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/safety/AccidentsPage.tsx` | pending |
| `apps/frontend/src/pages/safety/CSAMitigationQueue.tsx` | pending |
| `apps/frontend/src/pages/safety/ComplaintsPage.tsx` | pending |
| `apps/frontend/src/pages/safety/DotInspectionsPage.tsx` | pending |
| `apps/frontend/src/pages/safety/FinesPage.tsx` | pending |
| `apps/frontend/src/pages/safety/HoursOfServicePage.tsx` | pending |
| `apps/frontend/src/pages/safety/IdvrPage.tsx` | pending |
| `apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx` | pending |
| `apps/frontend/src/pages/safety/InternalFinesPage.tsx` | pending |
| `apps/frontend/src/pages/safety/PositionHistoryPage.tsx` | pending |
| `apps/frontend/src/pages/safety/SafetyEventsPage.tsx` | pending |
| `apps/frontend/src/pages/safety/components/IntegrityAlertsTab.tsx` | pending |
| `apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx` | pending |
| `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx` | pending |
| `apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx` | pending |
| `apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx` | pending |
| `apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx` | pending |
| `apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx` | pending |
| `apps/frontend/src/pages/safety/integrity-reports/DriverVendorMappingTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/CSAScoreTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/DriverScoringTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx` | pending |
| `apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx` | pending |

### pages/samsara-vendor-mapping (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx` | pending |

### pages/settings (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/settings/NotificationPreferencesPage.tsx` | pending |

### pages/tasks (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx` | pending |
| `apps/frontend/src/pages/tasks/TasksMinePage.tsx` | pending |
| `apps/frontend/src/pages/tasks/TasksReportPage.tsx` | pending |

### pages/units (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx` | pending |
| `apps/frontend/src/pages/units/UnitPermitsTab.tsx` | pending |
| `apps/frontend/src/pages/units/UnitTollTagsTab.tsx` | pending |

### pages/vendors (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/vendors/VendorsListView.tsx` | pending |

### pages/work-orders (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx` | pending |
| `apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx` | pending |

### portal/PortalDashboardPage.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/portal/PortalDashboardPage.tsx` | pending |

