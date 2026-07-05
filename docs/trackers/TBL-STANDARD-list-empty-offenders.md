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

## Migrated + locked — 62 surfaces (guard `MIGRATED` array is the source of truth)
Batch 1 (4, LIST-EMPTY-1) = the vendors/customers roster views. Batch 2 (2026-07-04) migrated the
remaining 58 offenders across accounting, banking, dispatch, factoring, insurance, legal, maintenance,
safety, reports, lists, work-orders + the customer/vendor/driver detail pages — every one routed through
`useListState` and registered in `scripts/verify-list-empty-settled.mjs` (run it for the authoritative list).

## Remaining sweep offenders — 8 (deliberately NOT migrated; each justified)
These 8 do not fit the settled-only recipe and were left as-is on purpose:
- `accounting/InvoiceCreateModal.tsx` — no query status (fed by `useInvoiceCreateFromLoad {loads,isLoading}`, not a `useQuery`).
- `accounting/PostingLineagePage.tsx` — not a query race (empty is `useMutation`-driven + null-guarded).
- `notifications/NotificationCenterPage.tsx` — `useNotifications` exposes only a `loading` bool; empty already `!loading`-guarded.
- `cash-advances/components/CashAdvancesTable.tsx` — child receives `rows` as a prop, owns no query (needs prop threading).
- `dispatch/components/LoadTable.tsx` — same (rows-prop child).
- `drivers/DriversTable.tsx` — same.
- `driver-finance/components/SettlementsTable.tsx` — same.
- `safety/components/SafetyEventsTable.tsx` — same.

> Deferred residual: `DispatchBoard` migrated its owned-query roster empty, but three loads-derived empties
> there still gate on a `loading` prop from the out-of-scope `DispatchList` parent — threading
> `ListQueryStatus` there is a future pass (the file no longer shows in the sweep, so it isn't guard-tracked).

## Original sweep offenders — 65 (as of 2026-07-03, historical)
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
