# TBL-STANDARD — false-empty list offenders (LIST-EMPTY-1 follow-on)

Source: `npm run verify:list-empty-settled` sweep (BLOCK LIST-EMPTY-1, PR fix/list-empty-1-false-empty-guard).

## Context
LIST-EMPTY-1 fixed the Vendors/Customers false-empty flash by introducing the shared
list-state primitive at `apps/frontend/src/components/list-state/` — the empty state renders
ONLY on a settled (non-loading, non-fetching) zero-row query, never mid-fetch.

The guard's sweep lists every other paged-list surface that still gates an empty message on a
bare `data.length === 0` without routing through the primitive. These are **candidate**
false-empty surfaces (each needs a per-file check of whether its list actually races an in-flight
query). Migrate them in follow-on **TBL-STANDARD** blocks; do not migrate blindly.

Migrate = pass the roster query status into the list surface and gate its empty literal on
`useListState(status, isEmpty).isEmpty` (see VendorsListView / VendorListSidebar for the pattern).
Adding a migrated file to the guard's `MIGRATED` registry then locks it against regression.

## Migrated + locked (6)
- apps/frontend/src/pages/vendors/VendorsListView.tsx
- apps/frontend/src/pages/vendors/VendorListSidebar.tsx
- apps/frontend/src/pages/customers/CustomersListView.tsx
- apps/frontend/src/pages/customers/CustomerListSidebar.tsx
- apps/frontend/src/pages/EquipmentTypesPage.tsx        (TBL-STANDARD batch 1, 2026-07-04)
- apps/frontend/src/pages/DriverLoadStatusesPage.tsx    (TBL-STANDARD batch 1, 2026-07-04)

> Note: `Vendors.tsx` / `Customers.tsx` still appear below because their *transaction* sub-tables
> ("No transactions for current filters.") remain bare-length — the roster lists themselves are fixed.

## Sweep offenders — 65 (as of 2026-07-03)
- apps/frontend/src/pages/CustomerDetail.tsx
- apps/frontend/src/pages/Customers.tsx
- apps/frontend/src/pages/DriverDetail.tsx
- apps/frontend/src/pages/DriverLoadStatusesPage.tsx
- apps/frontend/src/pages/EquipmentTypesPage.tsx
- apps/frontend/src/pages/Vendors.tsx
- apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx
- apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx
- apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx
- apps/frontend/src/pages/accounting/BillsPage.tsx
- apps/frontend/src/pages/accounting/DailyReconPage.tsx
- apps/frontend/src/pages/accounting/EscrowPage.tsx
- apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx
- apps/frontend/src/pages/accounting/FixedAssetsPage.tsx
- apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx
- apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx
- apps/frontend/src/pages/accounting/InvoicesListPage.tsx
- apps/frontend/src/pages/accounting/ManualJEListPage.tsx
- apps/frontend/src/pages/accounting/PaymentsListPage.tsx
- apps/frontend/src/pages/accounting/PostingLineagePage.tsx
- apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx
- apps/frontend/src/pages/accounting/ReceiptsPage.tsx
- apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx
- apps/frontend/src/pages/audit/AuditEventsList.tsx
- apps/frontend/src/pages/banking/BankAccountDetail.tsx
- apps/frontend/src/pages/banking/TransfersListPage.tsx
- apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx
- apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx
- apps/frontend/src/pages/banking/components/MatchDrawer.tsx
- apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx
- apps/frontend/src/pages/dispatch/DispatchBoard.tsx
- apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx
- apps/frontend/src/pages/dispatch/PodReviewPage.tsx
- apps/frontend/src/pages/dispatch/components/LoadTable.tsx
- apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx
- apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx
- apps/frontend/src/pages/drivers/DriversTable.tsx
- apps/frontend/src/pages/factoring/FactorAdmin.tsx
- apps/frontend/src/pages/factoring/ReserveDashboard.tsx
- apps/frontend/src/pages/insurance/ClaimsTab.tsx
- apps/frontend/src/pages/insurance/LawsuitsTab.tsx
- apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx
- apps/frontend/src/pages/legal/LegalPoliciesPage.tsx
- apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx
- apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx
- apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx
- apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx
- apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx
- apps/frontend/src/pages/maintenance/FleetTablePage.tsx
- apps/frontend/src/pages/maintenance/MaintenanceHome.tsx
- apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx
- apps/frontend/src/pages/notifications/NotificationCenterPage.tsx
- apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx
- apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx
- apps/frontend/src/pages/safety/AccidentsPage.tsx
- apps/frontend/src/pages/safety/FinesPage.tsx
- apps/frontend/src/pages/safety/IdvrPage.tsx
- apps/frontend/src/pages/safety/PositionHistoryPage.tsx
- apps/frontend/src/pages/safety/SafetyEventsPage.tsx
- apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx
- apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx
- apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx
- apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx
- apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx
- apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx
