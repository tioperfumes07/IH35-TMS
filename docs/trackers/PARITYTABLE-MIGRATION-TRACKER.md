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

## Rollup — DERIVED, never hand-edited

> **Do NOT add a hand-maintained count table here.** Every migration PR used to edit the same count
> lines, so those lines conflicted on every concurrent merge; each hand-resolve left another duplicate
> row behind. By 2026-07-20 this section had grown to **12 rows instead of 4**, carrying three
> contradictory `pending` values (179 / 180 / 183) and a `migrated` count of 23 when the real figure
> was **27** — the four sections appended below the inventory block were never counted. The numbers
> were both corrupt and silently wrong, which is why they are now derived instead of typed.
>
> This section is what made the file a merge-conflict magnet. Keeping it derived is what keeps the
> `merge=union` driver in `.gitattributes` safe: union is line-based and only correct on an
> **append-only** file. Re-introducing an edited-in-place count would resurrect both the conflicts
> and the duplicate-row corruption.

Counts are derived from the file itself — run:

```sh
F=docs/trackers/PARITYTABLE-MIGRATION-TRACKER.md
INV_START=$(grep -n '^## Remaining hand-rolled inventory' "$F" | cut -d: -f1)
INV_END=$(awk -v s="$INV_START" 'NR>s && /^## /{print NR-1; exit}' "$F")
echo "migrated:  $(( $(sed -n "1,$((INV_START-1))p" "$F" | grep -c '^| `apps/frontend/src/') \
                  + $(sed -n "$((INV_END+1)),\$p" "$F" | grep -c '^| `apps/frontend/src/') ))"
echo "remaining: $(sed -n "$INV_START,${INV_END}p" "$F" | grep -c '^| `apps/frontend/src/')"
```

**As of 2026-07-20:** migrated **30** · remaining in inventory **290** (of which 99 are
`financial-hold`, Jorge-gated per CLAUDE.md §1.4). The historical "300 hand-rolled total" is
approximate — ParityTable was already consumed by ~16 surfaces that were never hand-rolled, so
`migrated + remaining` does not reconcile to it and never did.

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

## GLOBAL-COLS-01 — migrated (this PR)
Read-only accounting audit-trail surface (no schema/migration/posting changed — traces an existing
source transaction to its already-posted GL rows). Columns preserved 1:1 from the pre-migration
hand-rolled table (Occurred, JE, Posting batch, Account, Side, Amount, Linked object); the page now
inherits sort + drag/keyboard/touch column resize + gear column-picker + CSV export via the same
shared `ParityTable` grammar `AccountingAuditTrailPage.tsx`'s lineage lookup already uses.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/accounting/PostingLineagePage.tsx` | pages/accounting |

## qbo-parity-a1 — EarningsTab (this PR)
Drivers hub Earnings/Debt tab (high-traffic shared component on `DriverDetail`): last-4
settlements + active liabilities were hand-rolled `<table>`s. Migrated both to shared
`ParityTable` (sort + resize + gear + emptyText). Columns + `data-testid` row hooks preserved
1:1. Guard: `scripts/verify-earnings-tab-uses-paritytable.mjs` via verify-step 1016.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/drivers/EarningsTab.tsx` | components/drivers |

## qbo-parity-a1 — ComplianceTable (this PR)
Compliance dashboard Overview credentials grid: hand-rolled `<table>` with Type/Owner
filters + CSV export. Migrated to shared `ParityTable` (sort + resize + gear + filterBar).
Owner Name cells use `EntityLink` for driver/unit/trailer. Columns + `compliance-table-panel`
testid preserved. Guard: `scripts/verify-compliance-table-uses-paritytable.mjs` via verify-step 1019.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/compliance/ComplianceTable.tsx` | components/compliance |

## qbo-parity-a1 — AssetListTable (this PR)
Assets workspace register was a hand-rolled `<table>` fed by a nonexistent `/api/v1/assets/list`
endpoint that silently fell back to demo rows. Migrated the grid to shared `ParityTable` and
wired the page to real `GET /api/v1/assets` + `ListErrorState`. Columns preserved 1:1.
Guard: `scripts/verify-asset-list-table-uses-paritytable.mjs` via verify-step 1020.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/assets/AssetListTable.tsx` | components/assets |

## qbo-parity-a1 — ActivityLogPage (this PR)
Owner/SuperAdmin audit activity stream was a hand-rolled `<table>` with a bare red outage banner.
Migrated to shared `ParityTable` (sort + resize + gear + `renderExpanded` full payload JSON) and
replaced the ad-hoc error div with `ListErrorState` + Retry. Columns preserved 1:1.
Guard: `scripts/verify-activity-log-uses-paritytable.mjs` via verify-step 1023.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/admin/ActivityLogPage.tsx` | pages/admin |

## qbo-parity-a1 — NotificationLogPanel
Compliance notification log: hand-rolled `<table>` (Sent/Credential/Owner Type/Channel/
Recipient/Status). Migrated to shared `ParityTable` (sort + resize + gear + CSV export).
`compliance-log-panel` testid preserved. Guard:
`scripts/verify-notification-log-uses-paritytable.mjs` via verify-step 1025.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/compliance/NotificationLogPanel.tsx` | components/compliance |

## qbo-parity-a1 — NotificationRulesPanel
Compliance notification rules grid: hand-rolled `<table>` (Credential/Scope/Days Before/
Channels/Recipients + Archive). Migrated to shared `ParityTable` (sort + resize + gear).
`compliance-rules-panel` testid preserved. Guard:
`scripts/verify-notification-rules-uses-paritytable.mjs` via verify-step 1024.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/compliance/NotificationRulesPanel.tsx` | components/compliance |
## qbo-parity-a1 — AuditHistoryTab (on main)
Drivers hub Audit History tab was a hand-rolled `<table>` with a bare red outage line and a
custom Expand/Hide details cell. Migrated to shared `ParityTable` (sort + resize + gear +
`renderExpanded` payload diff) and replaced the ad-hoc error with `ListErrorState` + Retry.
Columns When/Actor/Event/Summary/Details preserved 1:1. Guard:
`scripts/verify-driver-audit-history-uses-paritytable.mjs` via verify-step 1027.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/drivers/AuditHistoryTab.tsx` | components/drivers |

## qbo-parity-a1 — FrequentlyRunTable (on main)
Reports Home "Frequently run" list was a hand-rolled `<table>`. Migrated to shared
`ParityTable` (sort + resize + gear). Columns Report / Filters / Runs preserved 1:1;
Report name stays a Run button; stub P4/P5 badges preserved.
Guard: `scripts/verify-frequently-run-table-uses-paritytable.mjs` via verify-step 1028.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/reports/FrequentlyRunTable.tsx` | components/reports |

## qbo-parity-a1 — vehicle-profile PlatesTable (on main)
Vehicle profile plates grid was a hand-rolled `<table>` (Country/Jurisdiction/Plate #/
Expiration/Status) with Archive + Create Plate. Migrated to shared `ParityTable`
(sort + resize + gear + CSV export + `rowActions` Archive). `vp-plates-table` testid
preserved. Guard: `scripts/verify-vehicle-plates-uses-paritytable.mjs` via verify-step 1029.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/vehicle-profile/PlatesTable.tsx` | components/vehicle-profile |

## qbo-parity-a1 — vehicle ComplianceSection (this PR)
Vehicle profile Compliance registration-plates list was a hand-rolled `<table>`.
Migrated to shared `ParityTable` (sort + resize + gear). Columns Country /
Jurisdiction / Expiration preserved 1:1; US/MX insurance + DOT/SCT/PITA/IFTA
summary chrome preserved; plates grid still only renders when plates exist.
Guard: `scripts/verify-vehicle-compliance-uses-paritytable.mjs` via verify-step 1040.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/vehicle-profile/ComplianceSection.tsx` | components/vehicle-profile |

## qbo-parity-a1 — OperationsHistoryTable (on main)
Drivers hub operations-depth history (12 sub-views sharing one table) was a hand-rolled
`<table>` that false-emptied on query failure. Migrated to shared `ParityTable`
(sort + resize + gear) with `ListErrorState` + Retry. `EntityLink` via
`OperationsColumn.entityKind` and server Previous/Next pagination preserved.
Guard: `scripts/verify-ops-history-uses-paritytable.mjs` via verify-step 1026.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/drivers/OperationsHistoryTable.tsx` | components/drivers |
## qbo-parity-a1 — LoadHistoryTab (this PR)
Drivers hub Load History tab: hand-rolled `<table>` (Load # / Assigned At / Method /
Previous Driver / New Driver / Reason) with date filters. Migrated to shared `ParityTable`
(sort + resize + gear + filterBar); EntityLink + ListErrorState preserved 1:1.
Guard: `scripts/verify-load-history-tab-uses-paritytable.mjs` via verify-step 1032.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/drivers/LoadHistoryTab.tsx` | components/drivers |

## qbo-parity-a1 — SafetyEventsTable (this PR)
Safety events bulk-select grid was a hand-rolled `<table>` with BulkActionBar +
TableSelection. Migrated to shared `ParityTable` (sort + resize + gear +
selectable + batchActions). Columns Date/Driver/Unit/Type/Severity/Source/Action/
Status preserved 1:1; bulk export + archive stub retained; maxSelectable 200.
Guard: `scripts/verify-safety-events-table-uses-paritytable.mjs` via verify-step 1068.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx` | pages/safety |

## qbo-parity-a1 — StopReasoningTable (this PR)
Fuel planner recommended-stop reasoning grid was a hand-rolled `<table>`. Migrated to
shared `ParityTable` (sort + resize + gear). Columns #/Station/State/Mile/$/gal/Gallons/
Why This Stop/HOS preserved 1:1; skipped-stop strike + `bg-red-50` retained.
Guard: `scripts/verify-stop-reasoning-table-uses-paritytable.mjs` via verify-step 1041.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/fuel/components/StopReasoningTable.tsx` | pages/fuel |

## qbo-parity-a1 — EntityAuditHistoryTab (this PR)
Shared entity audit history tab (vendor/customer/driver/unit/load/WO) was a hand-rolled
`<table>` with a bare red outage banner. Migrated to shared `ParityTable`
(sort + resize + gear + `renderExpanded` Before→After `ChangesDiff`) and replaced the
ad-hoc error div with `ListErrorState` + Retry. Columns When/Who/Action/Summary/Source
preserved 1:1. Guard: `scripts/verify-entity-audit-history-uses-paritytable.mjs` via
verify-step 1035.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx` | components/audit |

## qbo-parity-a1 — DocsHomePage (this PR)
Documents home (`/docs`) foundation list was a hand-rolled `<table>` with a local empty
state and no query-outage surface. Migrated to shared `ParityTable` (sort + resize + gear +
filterBar + CSV export) and replaced silent failure with `ListErrorState` + Retry. Columns
File/Type/Entity/Size/Expires/Uploaded preserved 1:1; KPI drill-down filters, entity tabs,
UploadModal `operatingCompanyId` scoping, and server-side Previous/Next pagination retained.
Guard: `scripts/verify-docs-home-page-uses-paritytable.mjs` via verify-step 1081.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/docs/DocsHomePage.tsx` | pages/docs |
## qbo-parity-a1 — UnitDriverHistoryStrip (this PR)
Unit/driver assignment history strip (driver detail + unit contexts) was a hand-rolled
`<table>` with no query-error surface. Migrated to shared `ParityTable`
(sort + resize + gear) with `ListErrorState` + Retry. Columns Unit / Driver / Started /
Ended / Source preserved 1:1; dynamic title + Last N days chrome preserved.
Guard: `scripts/verify-unit-driver-history-strip-uses-paritytable.mjs` via verify-step 1086.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx` | pages/units |
## qbo-parity-a1 — VendorMappingResolutionPage (this PR)
Samsara vendor mapping resolution (unmapped / duplicate / name-mismatch) was three
hand-rolled `<table>` grids with a bare red outage banner. Migrated all three to shared
`ParityTable` (sort + resize + gear + CSV export) and replaced the ad-hoc error div with
`ListErrorState` + Retry. Columns preserved 1:1 per section. Guard:
`scripts/verify-vendor-mapping-resolution-uses-paritytable.mjs` via verify-step 1089.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx` | pages/samsara-vendor-mapping |

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
| `apps/frontend/src/components/assets/AssetListTable.tsx` | migrated (qbo-parity-a1) |

### components/audit (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/audit/AuditHistoryTab.tsx` | pending |
| `apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx` | migrated (qbo-parity-a1) |

### components/catalogs (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/catalogs/CatalogTable.tsx` | migrated (qbo-parity-a1) |

### components/compliance (0 remaining)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/compliance/NotificationLogPanel.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/compliance/NotificationRulesPanel.tsx` | migrated (qbo-parity-a1) |

### components/customers (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx` | migrated (qbo-parity-a1) |

### components/dispatch (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/dispatch/AccessorialEditor.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/dispatch/DispatchList.tsx` | pending |

### components/driver-profile (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/driver-profile/DocumentsSection.tsx` | pending |
| `apps/frontend/src/components/driver-profile/SettlementsSection.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx` | pending |

### components/drivers (3 remaining)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/drivers/AuditHistoryTab.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/drivers/EarningsTab.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/drivers/LoadHistoryTab.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/drivers/OperationsHistoryTable.tsx` | migrated (qbo-parity-a1) |

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
| `apps/frontend/src/components/home/DriverDaySummaryCard.tsx` | migrated (qbo-parity-a1) |

### components/insurance (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/insurance/PolicyCreateWizard.tsx` | migrated (qbo-parity-a1) |

### components/lists (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/components/lists/ListView/ListView.tsx` | financial-hold |

### components/maintenance (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/maintenance/LaborTracker.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/maintenance/PositionedPartPicker.tsx` | pending |

### components/reports (5)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/reports/FrequentlyRunTable.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/reports/LaneDetailModal.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/reports/LaneDetailModal.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx` | pending |
| `apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx` | migrated (qbo-parity-a1) |

### components/shared (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/shared/MobileOptimizedTable.tsx` | pending |
| `apps/frontend/src/components/shared/ResizableTable.tsx` | pending |

### components/trailer-profile (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/trailer-profile/PlatesTable.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx` | migrated (qbo-parity-a1) |

### components/vehicle-profile (3 remaining)

| File | Status |
| --- | --- |
| `apps/frontend/src/components/vehicle-profile/ComplianceSection.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx` | pending |
| `apps/frontend/src/components/vehicle-profile/PlatesTable.tsx` | migrated (qbo-parity-a1) |
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
| `apps/frontend/src/pages/DriverDetail.tsx` | migrated (verify-step 1095) |

### pages/VendorDetail.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/VendorDetail.tsx` | pending |

### pages/Vendors.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/Vendors.tsx` | pending |

### pages/accounting (42) — financial-hold

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
| `apps/frontend/src/pages/admin/ActivityLogPage.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/admin/ErrorMonitor.tsx` | pending |
| `apps/frontend/src/pages/admin/LaunchToggles.tsx` | migrated (fix/launch-toggles-paritytable) |
| `apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx` | pending |
| `apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx` | migrated (fix/feature-flags-manager-paritytable) |

### pages/audit (2)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/audit/AuditEventsList.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/audit/AuditTrailPage.tsx` | migrated (qbo-parity-a1) |

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
| `apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/compliance/Form2290Filings.tsx` | pending |
| `apps/frontend/src/pages/compliance/HosViewerSection.tsx` | pending |
| `apps/frontend/src/pages/compliance/HosTrackerSection.tsx` | pending |
| `apps/frontend/src/pages/compliance/HosViewerSection.tsx` | migrated (fix/hos-viewer-paritytable) |

### pages/customers (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/customers/CustomerCOITab.tsx` | migrated (qbo-parity-a1 via CoiTab) |
| `apps/frontend/src/pages/customers/CustomersListView.tsx` | pending |
| `apps/frontend/src/pages/customers/components/PortalUsersTab.tsx` | pending |
| `apps/frontend/src/pages/customers/tabs/CoiRequestsTab.tsx` | migrated (qbo-parity-a1 via CoiTab) |

### pages/daily-tasks (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx` | migrated (fix/daily-tasks-paritytable) |

### pages/dev (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/dev/BulkDemoPage.tsx` | migrated (fix/bulk-demo-paritytable) |

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

### pages/docs (0 remaining)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/docs/DocsHomePage.tsx` | migrated (qbo-parity-a1) |

### pages/driver-finance (7) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx` | migrated (verify-step 1120) — display-only; owner-greenlit UI-only migration |
| `apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx` | migrated (verify-step 1122) — owner-greenlit UI-only, display-only props-fed grid; `verify-liability-breakdown-modal-uses-paritytable.mjs` |
| `apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx` | migrated (verify-step 1121) — owner-greenlit display-only; read-only props-fed lines; columns Date/Description/Receipt #/Amount + subtotal preserved 1:1; `verify-reimbursements-section-uses-paritytable.mjs` |
| `apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx` | financial-hold |
| `apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx` | financial-hold |

### pages/drivers (4)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/drivers/DriverImportModal.tsx` | pending |
| `apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx` | migrated |
| `apps/frontend/src/pages/drivers/DriverImportModal.tsx` | migrated (fix/driver-import-modal-paritytable) |
| `apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx` | pending |
| `apps/frontend/src/pages/drivers/DriversTable.tsx` | pending |
| `apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx` | PR pending — ParityTable + ListErrorState (guard step 1071) |

### pages/factoring (9) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/factoring/BatchDetail.tsx` | migrated (verify-step 1126) — display-only, owner review required |
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
| `apps/frontend/src/pages/fuel/components/StopReasoningTable.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx` | pending |

### pages/home (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/home/DriverHubReportingPage.tsx` | migrated (qbo-parity-a1) |

### pages/insurance (6)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/insurance/ClaimsTab.tsx` | pending |
| `apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx` | pending |
| `apps/frontend/src/pages/insurance/LawsuitsTab.tsx` | pending |
| `apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx` | pending |
| `apps/frontend/src/pages/insurance/PolicyDetail.tsx` | pending |

### pages/integrations (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx` | migrated (fix/edi-transaction-log-paritytable) |

### pages/legal (5)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx` | done — fleet picker and per-truck terms migrated to ParityTable; `verify-lease-to-own-creator-uses-paritytable.mjs` via verify-step 1082 |
| `apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx` | pending |
| `apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx` | pending |
| `apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx` | pending |
| `apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx` | pending |

### pages/liabilities (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx` | migrated (verify-step 1123) — owner-greenlit UI-only, display-only; `verify-liabilities-table-uses-paritytable.mjs` |

### pages/lists (11) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx` | migrated (verify-step 1101) |
| `apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx` | migrated (verify-step 1102) |
| `apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx` | migrated (verify-step 1103) |
| `apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx` | migrated (verify-step 1104) — display-only; owner-greenlit UI-only migration |
| `apps/frontend/src/pages/lists/accounting/QBOBulkLinkPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/accounting/QBOBulkLinkPage.tsx` | migrated (verify-step 1112) |
| `apps/frontend/src/pages/lists/components/QboSyncHealthCard.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx` | migrated — display-only ParityTable migration (owner greenlit); `verify-dispatch-catalog-list-uses-paritytable.mjs` via verify-step 1106 |
| `apps/frontend/src/pages/lists/components/QboSyncHealthCard.tsx` | migrated (verify-step 1110) |
| `apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx` | done — owner-greenlit UI-only migration; columns Code/Display Name/Description/Order/Status preserved; `verify-driver-catalog-list-uses-paritytable.mjs` via verify-step 1107 |
| `apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx` | migrated (verify-step 1105) — owner-greenlit UI-only; `verify-oem-parts-catalog-uses-paritytable.mjs` |
| `apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx` | migrated (verify-step 1108) |
| `apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx` | financial-hold |
| `apps/frontend/src/pages/lists/names/NamesMasterHub.tsx` | migrated — read-only navigator results grid to ParityTable + ListErrorState (display-only; Open button preserved); `verify-names-master-hub-uses-paritytable.mjs` via verify-step 1109 |

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
| `apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx` | migrated (verify-step 1096) |
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
| `apps/frontend/src/pages/operations/GeofencesPage.tsx` | migrated (fix/geofences-paritytable) |

### pages/payroll-integration (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/payroll-integration/PayrollAggregateTable.tsx` | migrated (verify-step 1111) |

### pages/profitability (4) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/profitability/ByCustomerView.tsx` | migrated (verify-step 1097) |
| `apps/frontend/src/pages/profitability/ByLaneView.tsx` | financial-hold |
| `apps/frontend/src/pages/profitability/ByLoadView.tsx` | migrated (verify-step 1099) |
| `apps/frontend/src/pages/profitability/ByLaneView.tsx` | migrated (verify-step 1098) |
| `apps/frontend/src/pages/profitability/ByLoadView.tsx` | financial-hold |
| `apps/frontend/src/pages/profitability/ByTypeView.tsx` | migrated (verify-step 1100) |

### pages/qbo (1) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx` | migrated (verify-step 1113) |

### pages/qbo-sync-detail (2) — financial-hold

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/qbo-sync-detail/ConflictsTab.tsx` | financial-hold |
| `apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx` | migrated (verify-step 1114) |

### pages/reports (26)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/reports/APAgingPage.tsx` | pending |
| `apps/frontend/src/pages/reports/ARAgingPage.tsx` | pending |
| `apps/frontend/src/pages/reports/BalanceSheetPage.tsx` | pending |
| `apps/frontend/src/pages/reports/BookingGapReport.tsx` | migrated (fix/booking-gap-report-paritytable) |
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
| `apps/frontend/src/pages/reports/ifta/IFTAStepMiles.tsx` | migrated (qbo-parity-a1) |
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
| `apps/frontend/src/pages/safety/PositionHistoryPage.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/safety/SafetyEventsPage.tsx` | pending |
| `apps/frontend/src/pages/safety/components/IntegrityAlertsTab.tsx` | pending |
| `apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx` | pending |
| `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx` | migrated (#1088) |
| `apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx` | pending |
| `apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx` | pending |
| `apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx` | migrated (fix/drug-alcohol-program-paritytable) |
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

### pages/settings (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/settings/NotificationPreferencesPage.tsx` | migrated (fix/notification-preferences-paritytable) |

### pages/tasks (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx` | pending |
| `apps/frontend/src/pages/tasks/TasksMinePage.tsx` | pending |
| `apps/frontend/src/pages/tasks/TasksReportPage.tsx` | pending |

### pages/units (3)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx` | migrated (qbo-parity-a1) |
| `apps/frontend/src/pages/units/UnitPermitsTab.tsx` | pending |
| `apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx` | pending |
| `apps/frontend/src/pages/units/UnitTollTagsTab.tsx` | pending |
| `apps/frontend/src/pages/units/UnitTollTagsTab.tsx` | migrated |

### pages/vendors (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/vendors/VendorsListView.tsx` | pending |

### pages/work-orders (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx` | pending |
| `apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx` | pending |
| `apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx` | shipped (#TBD) |

### portal/PortalDashboardPage.tsx (1)

| File | Status |
| --- | --- |
| `apps/frontend/src/portal/PortalDashboardPage.tsx` | migrated (qbo-parity-a1) |

## qbo-parity-a1 — vehicle DocumentsSection (this PR)
Vehicle profile documents list was a hand-rolled `<table>`. Migrated to shared
`ParityTable` (sort + resize + gear). Columns Type / Name / Expiration / Uploaded
preserved 1:1; expiration urgency coloring + UploadModal entity scoping +
`vp-docs-upload-button` preserved.
Guard: `scripts/verify-vehicle-documents-uses-paritytable.mjs` via verify-step 1037.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx` | components/vehicle-profile |

## qbo-parity-a1 — ErrorMonitorPage (this PR)
Owner error-monitor buffered stream was a hand-rolled `<table>` with a bare red
outage line. Migrated to shared `ParityTable` (sort + resize + gear +
`renderExpanded` detail JSON) and replaced the ad-hoc error with `ListErrorState`
+ Retry. Columns Time/Kind/Message/Detail preserved 1:1.
Guard: `scripts/verify-error-monitor-uses-paritytable.mjs` via verify-step 1036.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/admin/ErrorMonitor.tsx` | pages/admin |

## qbo-parity-a1 — trailer-profile PlatesTable (this PR)
Trailer profile plates grid was a hand-rolled `<table>` (Country/Jurisdiction/Plate/
Expiration). Migrated to shared `ParityTable` (sort + resize + gear + CSV export).
`tp-plates-table` testid preserved. Guard:
`scripts/verify-trailer-plates-uses-paritytable.mjs` via verify-step 1039.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/trailer-profile/PlatesTable.tsx` | components/trailer-profile |

## qbo-parity-a1 — DriverDaySummaryCard (home)
Home "Driver day-summaries" grid was a hand-rolled `<table>` with a bare red outage
banner. Migrated to shared `ParityTable` (sort + resize + gear) and replaced the
ad-hoc error with `ListErrorState` + Retry. Columns Driver / Miles / On-duty hrs /
Fuel stops / On-time / Late preserved 1:1; DatePicker + no-HOS empty copy preserved.
Guard: `scripts/verify-driver-day-summary-uses-paritytable.mjs` via verify-step 1038.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/home/DriverDaySummaryCard.tsx` | components/home |

## qbo-parity-a1 — AuditTrailPage (this PR)
Universal spine audit trail was a hand-rolled `<table>` with a bare red outage line and
manual expand rows. Migrated to shared `ParityTable` (sort + resize + gear +
`renderExpanded` payload/correlation detail) and replaced the ad-hoc error with
`ListErrorState` + Retry. Columns When / Event type / Actor / Entity / Source preserved
1:1; server offset pagination preserved. Guard:
`scripts/verify-audit-trail-uses-paritytable.mjs` via verify-step 1043.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/audit/AuditTrailPage.tsx` | pages/audit |

## qbo-parity-a1 — CancellationsReportPage (this PR)
Reports → Cancellations analytics had four hand-rolled bucket `<table>`s (reason /
driver / customer / date). Migrated all four to shared `ParityTable` (sort + resize +
gear + CSV export). Columns Count / Billable / Charges preserved 1:1; KPI summary
cards and date-range filters preserved. Guard:
`scripts/verify-cancellations-report-uses-paritytable.mjs` via verify-step 1058.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/CancellationsReportPage.tsx` | pages/reports |

## qbo-parity-a1 — Step3JurisdictionCalc (this PR)
IFTA Step 3 jurisdiction tax grid was a hand-rolled `<table>` with a rates-source link,
fleet MPG header, and total net tax footer. Migrated to shared `ParityTable` (sort + resize +
gear + CSV export). Columns State/Miles/Fuel gal/Rate/gal/Net taxable gal/Tax owed preserved
1:1; `data-ifta-step="3"` marker + empty prep copy + total net tax summary preserved. Guard:
`scripts/verify-ifta-step3-jurisdiction-uses-paritytable.mjs` via verify-step 1053.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx` | components/reports/ifta |

## qbo-parity-a1 — QboVendorLinkagePage (this PR)
Admin QBO vendor/class linkage (Drivers + Assets tabs) was two hand-rolled `<table>` grids
with no outage chrome on query failure. Migrated both to shared `ParityTable`
(sort + resize + gear) and added `ListErrorState` + Retry per tab. Driver columns
Driver / Current Vendor / Status / Actions and asset columns Unit / QBO Class / Actions
preserved 1:1; filter bar + auto-link high-confidence action preserved.
Guard: `scripts/verify-qbo-vendor-linkage-uses-paritytable.mjs` via verify-step 1042.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx` | pages/admin |


## qbo-parity-a1 — FreeTimeDetentionEditor (this PR)
Customer Billing free-time/detention terms history was a hand-rolled `<table>`.
Migrated to shared `ParityTable` (sort + resize + gear) and replaced bare red error
lines with `ListErrorState` + Retry on terms and history query failure. Columns
Recorded / Free Time / Rate / Currency / Approval preserved 1:1. Guard:
`scripts/verify-freetime-detention-uses-paritytable.mjs` via verify-step **1046**.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx` | components/customers |
## qbo-parity-a1 — CatalogTable (this PR)
Lists GenericCatalogPage grid was a hand-rolled `<table>` wrapped in BulkActionBar /
TableSelection. Migrated to shared `ParityTable` (sort + resize + gear + selectable batch
actions + row Edit/Archive). Search + Active/Inactive/All filterBar, selection cap 200,
and emptyText preserved 1:1. Guard: `scripts/verify-catalog-table-uses-paritytable.mjs`
via verify-step **1045**.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/catalogs/CatalogTable.tsx` | components/catalogs |
## qbo-parity-a1 — TrailerReeferSection (this PR)
Trailer reefer hours log was a hand-rolled `<table>`. Migrated to shared
`ParityTable` (sort + resize + gear). Columns preserved 1:1; reefer hours entry
chrome + entity scoping preserved.
Guard: `scripts/verify-trailer-reefer-uses-paritytable.mjs` via verify-step 1044.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx` | components/trailer-profile |

## qbo-parity-a1 — SettlementsSection (this PR)
Driver-profile Settlements last-4-weeks grid was a hand-rolled `<table>`. Migrated to
shared `ParityTable` (sort + resize + gear). Columns Week ending / Gross / Net preserved
1:1; YTD tiles + Auto-pay + Full settlements link unchanged. Guard:
`scripts/verify-driver-settlements-section-uses-paritytable.mjs` via verify-step **1048**.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/driver-profile/SettlementsSection.tsx` | components/driver-profile |
## qbo-parity-a1 — AccessorialEditor (this PR)
Book-load accessorial charge grid was a hand-rolled `<table>` with inline editors.
Migrated to shared `ParityTable` (sort + resize + gear + row Remove action) and added
`ListErrorState` on additional-charges catalog failure. Columns Code / Description /
Amount ($) / Taxable + Create charge / detention·layover·lumper seeds preserved 1:1.
Guard: `scripts/verify-accessorial-editor-uses-paritytable.mjs` via verify-step **1047**.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/dispatch/AccessorialEditor.tsx` | components/dispatch |
## qbo-parity-a1 — PolicyCreateWizard (this PR)
Insurance Create-Policy wizard Step 4 bill-schedule preview was a hand-rolled
`<table>` (Bill # / Amount / Per vehicle / mo). Migrated to shared `ParityTable`
(sort + resize + gear). Columns preserved 1:1; 4-step wizard behavior, vehicle
selection, premium math, and `+ Create policy + schedule N bills` unchanged.
Coverage-type catalog + units list query outages now surface `ListErrorState` +
Retry (no false-empty). Guard:
`scripts/verify-policy-create-wizard-uses-paritytable.mjs` via verify-step 1054.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/insurance/PolicyCreateWizard.tsx` | components/insurance |
## qbo-parity-a1 — IFTA Step1MileageReview (this PR)
IFTA quarterly preparer Step 1 mileage review was a hand-rolled `<table>`
(State / Aggregated miles / Override miles) with inline override inputs.
Migrated to shared `ParityTable` (sort + resize + gear). Columns + override
number inputs (`ifta-miles-override-*`) + Save + Total summary preserved 1:1.
Form-only surface (filing prop + save callback — no query failure path, no
`ListErrorState`). Operational IFTA filing review, not GL posting.
Guard: `scripts/verify-ifta-step1-mileage-uses-paritytable.mjs` via verify-step 1051.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx` | components/reports/ifta |
## qbo-parity-a1 — LaneDetailModal (this PR)
Reports lane profitability drill-down loads grid was a hand-rolled `<table>`. Migrated to
shared `ParityTable` (sort + resize + gear). Columns Load / Date / Revenue / Driver pay /
Fuel / Maint. / Profit / Miles / Margin preserved 1:1; Load stays an `EntityLink`. Guard:
`scripts/verify-lane-detail-modal-uses-paritytable.mjs` via verify-step **1049**.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/reports/LaneDetailModal.tsx` | components/reports |
## qbo-parity-a1 — Step2FuelReview (this PR)
IFTA Step 2 fuel review was a hand-rolled `<table>` with per-jurisdiction override
inputs and a Total footer. Migrated to shared `ParityTable` (sort + resize + gear +
CSV export). Columns State / Aggregated gallons / Override gallons preserved 1:1;
override number inputs + `ifta-fuel-override-*` testids + Save fuel overrides + Total
summary preserved. Guard: `scripts/verify-ifta-step2-fuel-uses-paritytable.mjs` via
verify-step 1052.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx` | components/reports/ifta |
## qbo-parity-a1 — LaborTracker (this PR)
Maintenance WO labor entries grid was a hand-rolled `<table>`. Migrated to shared
`ParityTable` (sort + resize + gear + row Stop/Rate/Remove actions) and added
`ListErrorState` on entries query failure. Columns ID / Actor / Start / End / Min /
Cost ¢ preserved 1:1; Clock in + manual book range unchanged. Guard:
`scripts/verify-labor-tracker-uses-paritytable.mjs` via verify-step **1050**.

| File | Module |
| --- | --- |
| `apps/frontend/src/components/maintenance/LaborTracker.tsx` | components/maintenance |

## qbo-parity-a1 — IFTAStepGallons (this PR)
IFTA preparation Step 2 state-gallons grid was a hand-rolled `<table>`. Migrated
to shared `ParityTable` (sort + resize + gear). Columns State / Gallons / Source /
Breakdown and the aggregate action, empty state, last-aggregated timestamp, and total
gallons summary are preserved. Guard:
`scripts/verify-ifta-step-gallons-uses-paritytable.mjs` via verify-step **1059**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/ifta/IFTAStepGallons.tsx` | pages/reports/ifta |
## qbo-parity-a1 — CreateWOSectionReconcile (this PR)
Maintenance Create Work Order vendor-invoice reconcile was a hand-rolled
`<table>`. Migrated to shared `ParityTable` (sort + resize + gear). Columns
blank label / WO total / Invoice total / Variance preserved 1:1; editable Parts
and Labor invoice totals, dollar-prefix inputs, variance math, and the hard
Create tie gate are unchanged. `ListErrorState` is not applicable because this
component has no query or other asynchronous list source. Guard:
`scripts/verify-create-wo-reconcile-uses-paritytable.mjs` via verify-step
**1056**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/maintenance/components/CreateWOSectionReconcile.tsx` | pages/maintenance |
## qbo-parity-a1 — BookingGapReport (this PR)
Dispatcher booking-gap analytics was a hand-rolled `<table>` with manual loading/empty
states. Migrated to shared `ParityTable` (sort + resize + gear); `ListErrorState` +
Retry preserved on outage. Columns Rank / Dispatcher / Loads / Avg Gap (h) / P50 (h) /
P90 (h) preserved 1:1; week/month/quarter period toggle + rank row highlight preserved.
Guard: `scripts/verify-booking-gap-report-uses-paritytable.mjs` via verify-step **1057**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/BookingGapReport.tsx` | pages/reports |

## qbo-parity-a1 — DriverLayoverHistory (this PR)
Driver layover history was a hand-rolled `<table>` with manual loading and empty states.
Migrated to shared `ParityTable` (sort + resize + gear); `ListErrorState` + Retry now
surfaces query failures. Columns Started / Ended / Hours / Billable / Per Diem, date-range
filters, billable toggle, and per-diem eligibility remain preserved 1:1. Guard:
`scripts/verify-driver-layover-history-uses-paritytable.mjs` via verify-step **1067**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx` | pages/drivers |
## qbo-parity-a1 — GeofencesPage (this PR)
Operations telematics geofences list was a hand-rolled `<table>` with loading-only
failure chrome. Migrated to shared `ParityTable` (sort + resize + gear + CSV export)
and added `ListErrorState` + Retry on geofences query failure. Columns Label / Kind /
Linked ref / Vertices / Status / Action preserved 1:1; polygon create form +
Activate/Deactivate toggle preserved. Guard:
`scripts/verify-geofences-page-uses-paritytable.mjs` via verify-step **1072**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/operations/GeofencesPage.tsx` | pages/operations |
## qbo-parity-a1 — DailyTasksPage (this PR)

Daily Tasks was a hand-rolled six-column task grid. Migrated to shared
`ParityTable` (sort + resize + gear + CSV export + paging) and now renders
`ListErrorState` with Retry when the selected task view fails. Task / Status /
Assignee / Due / Timestamps / Actions, overdue highlighting, task row test IDs,
and Accept / Complete / Details actions are preserved. Guard:
`scripts/verify-daily-tasks-uses-paritytable.mjs` via verify-step **1070**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx` | pages/daily-tasks |
## qbo-parity-a1 — TypeCatalogAdmin (this PR)
Insurance type catalog admin grid was a hand-rolled `<table>` with inline edit and
deactivate actions. Migrated to shared `ParityTable` (sort + resize + gear);
`ListErrorState` on catalog query failure (never false-empty). Columns Code / Name /
Description / Sort / Status / Actions preserved 1:1; + Create type form and
Edit/Save/Cancel/Deactivate unchanged. Guard:
`scripts/verify-type-catalog-admin-uses-paritytable.mjs` via verify-step **1073**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx` | pages/insurance |
## qbo-parity-a1 — PositionHistoryPage (this PR)
Safety Integrity position history was a hand-rolled `<table>` plus a separate mobile card
layout with manual loading/empty rows. Migrated to shared `ParityTable` (sort + resize +
gear + CSV export); `ListErrorState` + Retry on outage. Columns Timestamp / Action / Unit /
Position / Part / Actor / Notes preserved 1:1; unit/action filters + server Previous/Next
pagination preserved. Guard: `scripts/verify-position-history-uses-paritytable.mjs` via
verify-step **1069**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/safety/PositionHistoryPage.tsx` | pages/safety |
## qbo-parity-a1 — EdiTransactionLog (this PR)
EDI transaction log was a hand-rolled `<table>` with no outage handling. Migrated to
shared `ParityTable` (sort + resize + gear + CSV export); `ListErrorState` + Retry on
outage. Columns Type / Dir / Status / Control # / Received preserved 1:1; status filter,
raw EDI viewer side panel, row selection, and `edi-transaction-log` testid preserved.
Guard: `scripts/verify-edi-transaction-log-uses-paritytable.mjs` via verify-step **1074**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx` | pages/integrations |
## qbo-parity-a1 — LaunchTogglesPage (this PR)
Owner launch-toggles carrier grid was a hand-rolled `<table>` with no query-outage
surface. Migrated to shared `ParityTable` (sort + resize + gear) and added
`ListErrorState` + Retry on load failure. Columns Carrier / Status / Last action /
Actions preserved 1:1; Launch + Rollback confirm flows, optional launch notes, and
mutation error banner unchanged. Guard:
`scripts/verify-launch-toggles-uses-paritytable.mjs` via verify-step **1075**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/admin/LaunchToggles.tsx` | pages/admin |
## qbo-parity-a1 — FeatureFlagsManager (this PR)
Owner feature-flags admin was a hand-rolled `<table>` with no list-outage chrome on
query failure. Migrated to shared `ParityTable` (sort + resize + gear) and replaced
load failure with `ListErrorState` + Retry. Columns Key / Default / Rollout % /
Overrides / Actions preserved 1:1; per-entity-only notice, create-flag form, tenant
override picker, and Tenant override ON action unchanged.
Guard: `scripts/verify-feature-flags-manager-uses-paritytable.mjs` via verify-step **1076**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx` | pages/admin |
## qbo-parity-a1 — FleetHosBoardSection (this PR)
Compliance Live Fleet HOS used separate hand-rolled live and offline/stale `<table>`
grids plus manual paging and query-error text. Migrated both grids to shared
`ParityTable` (sort + resize + gear + paging) and added retryable `ListErrorState`.
All 14 live columns, the five offline columns, row unit-detail drill-through, live
search/count, refresh, Excel export, seven-day stale segregation, and neutral stale /
low-clock emphasis remain intact. Guard:
`scripts/verify-fleet-hos-board-uses-paritytable.mjs` via verify-step **1064**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx` | pages/compliance |
## qbo-parity-a1 — AuditEventsList (this PR)
Bulk-call forensic audit events list was on legacy `DataTable` + `dataTableErrorState`.
Migrated to shared `ParityTable` (sort + resize + gear + renderExpanded payload JSON);
`ListErrorState` + Retry on outage. Columns When / Event / Actor / Bulk Call / Source
preserved 1:1; bulk_call_id filter + click-to-filter preserved. Guard:
`scripts/verify-audit-events-list-uses-paritytable.mjs` via verify-step **1077**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/audit/AuditEventsList.tsx` | pages/audit |
## qbo-parity-a1 — BulkDemoPage (this PR)
Dev-only bulk-components demo was a hand-rolled `<table>` with manual pager and
legacy TableSelection/BulkActionBar chrome. Migrated to shared `ParityTable`
(sort + resize + gear + select-all + batch bar). Columns Name / Status preserved
1:1; BulkActionModal + BulkProgressDialog + mock bulkUpdate call unchanged.
Mock static rows (no query failure path → no ListErrorState). Guard:
`scripts/verify-bulk-demo-uses-paritytable.mjs` via verify-step **1078**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/dev/BulkDemoPage.tsx` | pages/dev |
## qbo-parity-a1 — LegalTemplateDetailPage (this PR)
Legal template detail's Version history and append-only Audit log grids were hand-rolled
`<table>` implementations. Migrated both to shared `ParityTable` (sort + resize + gear);
the audit event payload remains expandable, all six existing columns remain in their
original groups and order, and template-detail query failures now use retryable
`ListErrorState`. Guard:
`scripts/verify-legal-template-detail-uses-paritytable.mjs` via verify-step **1080**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx` | pages/legal |
## qbo-parity-a1 — CoiTab (this PR)
Shared customer COI requests grid (Customers list `CustomerCOITab` list-preview +
CustomerDetail `CoiRequestsTab` full-page) was already on `ParityTable` but still
surfaced a bare red outage banner. Replaced with `ListErrorState` + Retry and
guarded the shared `CoiTab` surface. Columns Requested/Status/Expires/Document/Notes
(list-preview) and Date/Requester User/Policy Reference/Insurer Email/Status/Action
(full-page) preserved 1:1; status filter + Create COI modal + inline update preserved.
Guard: `scripts/verify-customer-coi-uses-paritytable.mjs` via verify-step **1083**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/customers/CoiTab.tsx` | pages/customers |

## qbo-parity-a1 — DrugAlcoholProgramTab (this PR)
Safety Drug & Alcohol Program tab had two hand-rolled `<table>` grids (consortium
enrollments + positive-result SAP queue). Migrated both to shared `ParityTable`
(sort + resize + gear + CSV export); `ListErrorState` + Retry on each query
failure (no false-empty). Columns Driver / Consortium / Enrolled and Driver /
Type / Kind / Result / Collected preserved 1:1 with `EntityLink` driver
drill-through; section headings + count badges + empty states unchanged.
Guard: `scripts/verify-drug-alcohol-program-uses-paritytable.mjs` via
verify-step **1084**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx` | pages/safety/drug-alcohol |
## qbo-parity-a1 — NotificationPreferencesPage (this PR)
Settings notification preferences was a hand-rolled `<table>` for the per-event channel
matrix. Migrated to shared `ParityTable` (sort + resize + gear); `ListErrorState` +
Retry preserved on outage. Columns Event / Email / Sms / Whatsapp / In-app preserved 1:1;
channel master toggles + quiet hours + Save/Reset preserved.
Guard: `scripts/verify-notification-preferences-uses-paritytable.mjs` via verify-step **1085**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/settings/NotificationPreferencesPage.tsx` | pages/settings |
## qbo-parity-a1 — DriverScoreDetail (this PR)
Safety driver-score detail 12-period breakdown was a hand-rolled `<table>`.
Migrated to shared `ParityTable` (sort + resize + gear); `ListErrorState` + Retry on
trend query failure. Columns Period / Score / Rank / Brakes / Accel / Speeding (s) / Lane
preserved 1:1; sparkline, latest-stats grid, and harsh-event timeline + dashcam
drill-through unchanged. Guard:
`scripts/verify-driver-score-detail-uses-paritytable.mjs` via verify-step **1087**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx` | pages/safety/driver-scoring |
## qbo-parity-a1 — DriverImportModal (this PR)
Drivers Master Contacts CSV import preview was a hand-rolled `<table>` inside the modal.
Migrated to shared `ParityTable` (sort + resize + gear). Columns Name / Hire / Term /
Status / Result preserved 1:1; preview summary cards + commit gate unchanged.
`ListErrorState` + Retry on preview failure (no toast-only outage). Guard:
`scripts/verify-driver-import-modal-uses-paritytable.mjs` via verify-step **1079**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/drivers/DriverImportModal.tsx` | pages/drivers |
## qbo-parity-a1 — UnitPermitsTab (this PR)
Unit detail Permits tab was a hand-rolled `<table>` with manual loading/empty states.
Migrated to shared `ParityTable` (sort + resize + gear); `ListErrorState` + Retry on
outage. Columns Type / State / Number / Expires / Cost preserved 1:1; CertExpiryBadge,
critical expiry alert, and Archive action preserved. Guard:
`scripts/verify-unit-permits-tab-uses-paritytable.mjs` via verify-step **1090**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/units/UnitPermitsTab.tsx` | pages/units |
## qbo-parity-a1 — UnitTollTagsTab (this PR)
Unit detail toll-tags tab was a hand-rolled `<table>` with manual loading/empty
states. Migrated to shared `ParityTable` (sort + resize + gear); `ListErrorState` +
Retry on query failure (no false-empty on outage). Columns Network / Tag # /
Activated / Balance / Monthly / Status preserved 1:1; low-balance amber highlight +
Low badge and TxTAG · EZ-Pass · I-Pass header preserved. Guard:
`scripts/verify-unit-toll-tags-uses-paritytable.mjs` via verify-step **1091**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/units/UnitTollTagsTab.tsx` | pages/units |
## qbo-parity-a1 — PortalDashboardPage (this PR)
Shipper portal "Your loads" dashboard was a hand-rolled `<table>` with a bare red
outage line. Migrated to shared `ParityTable` (sort + resize + gear + CSV export)
and replaced the ad-hoc error with `ListErrorState` + Retry. Columns Load # / Route /
Status / Progress preserved 1:1; load detail links, progress StatusBadge, 30s
auto-refresh, and empty copy preserved.
Guard: `scripts/verify-portal-dashboard-uses-paritytable.mjs` via verify-step **1094**.

| File | Module |
| --- | --- |
| `apps/frontend/src/portal/PortalDashboardPage.tsx` | portal |
## qbo-parity-a1 — WOTimeTrackingPanel (this PR)
WO detail labor-time entries grid was a hand-rolled `<table>`. Migrated to shared
`ParityTable` (sort + resize + gear + row Stop/Rate/Remove actions) and added
`ListErrorState` on entries query failure. Columns ID / Actor / Start / End / Min /
Cost ¢ preserved 1:1; Start timer + manual entry unchanged. Guard:
`scripts/verify-wo-time-tracking-uses-paritytable.mjs` via verify-step **1092**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx` | pages/work-orders |
## qbo-parity-a1 — DriverHubReportingPage (this PR)
Driver Inbox Reporting by-driver grid was a hand-rolled `<table>` with a bare red
outage banner. Migrated to shared `ParityTable` (sort + resize + gear) and replaced
the ad-hoc error with `ListErrorState` + Retry. Columns Driver / Total / Approved /
Denied / Approval % / Time-to-view / Time-to-approve / Approved volume preserved 1:1;
summary cards + Export CSV + not_computed chrome preserved. Guard:
`scripts/verify-driver-hub-reporting-uses-paritytable.mjs` via verify-step **1055**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/home/DriverHubReportingPage.tsx` | pages/home |

## qbo-parity-a1 — IFTAStepTax (this PR)
IFTA preparation Step 3 tax grid was a hand-rolled `<table>` with a tfoot total row.
Migrated to shared `ParityTable` (sort + resize + gear + CSV export). Columns State /
Miles / Taxable gal / Paid gal / Net gal / Rate / Tax/Credit preserved 1:1; calculate
action, last-calculated timestamp, credit green styling, and total net tax summary
preserved. Guard: `scripts/verify-ifta-step-tax-uses-paritytable.mjs` via verify-step **1061**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/ifta/IFTAStepTax.tsx` | pages/reports/ifta |

## qbo-parity-a1 — AuditReportPage (this PR)
The shared, display-only audit-report grid was a hand-rolled `<table>` used by user,
module, maintenance, deduction, void/reversal, period-close, and financial-change
audit reports. Migrated it to `ParityTable` (sort + resize + gear + density) while
preserving the five columns, filter inputs, CSV export, and server-side report
pagination. This change does not create, edit, void, post, or otherwise mutate GL
records. Guard: `scripts/verify-audit-report-page-uses-paritytable.mjs` via
verify-step **1063**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/audit/AuditReportPage.tsx` | pages/reports/audit |

## qbo-parity-a1 — RunnerTable (this PR)
The reusable report-runner results grid was a hand-rolled `<table>`. Migrated to shared
`ParityTable` (sort + resize + gear + paging) while preserving every configuration-driven
column, order, alignment, currency/percent/number/date formatting, optional `onSort`
callback, per-report preference key, id/index row-key fallback, and empty-state copy.
Guard: `scripts/verify-runner-table-uses-paritytable.mjs` via verify-step **1062**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/runners/RunnerTable.tsx` | pages/reports/runners |

## qbo-parity-a1 — IFTAStepMiles (this PR)
IFTA quarterly preparer Step 1 state miles (`pages/reports/ifta/IFTAStepMiles`) was a
hand-rolled `<table>` with aggregate action + last-aggregated stamp + total footer.
Migrated to shared `ParityTable` (sort + resize + gear). Columns State / Miles / Source
preserved 1:1; Run Step 1 aggregate + last aggregated + Total summary retained.
Guard: `scripts/verify-ifta-step-miles-uses-paritytable.mjs` via verify-step **1060**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/reports/ifta/IFTAStepMiles.tsx` | pages/reports/ifta |

## qbo-parity-a1 — HosTrackerSection (this PR)
Compliance HOS Tracker roster was a hand-rolled `<table>` with a bare red outage
message. Migrated to shared `ParityTable` (sort + resize + gear) and replaced the
ad-hoc error with `ListErrorState` + Retry. Columns Driver / Unit / Status / Drive /
Shift / Cycle / Driven (cyc) preserved 1:1; duty-state display, numeric alignment,
unavailable-row treatment, date strip, KPI cards, and cycle-detail drawer preserved.
Guard: `scripts/verify-hos-tracker-uses-paritytable.mjs` via verify-step **1065**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/compliance/HosTrackerSection.tsx` | pages/compliance |

## qbo-parity-a1 — HosViewerSection (this PR)
Compliance HOS Viewer duty-segment log was a hand-rolled `<table>` with a bare outage
message. Migrated it to shared `ParityTable` (sort + resize + gear + CSV export) and
replaced the bare failure state with `ListErrorState` + Retry. Columns Duty status /
Start (CT) / End (CT) / Duration, duty-color markers, driver/date controls, HOS clock
cards, per-status totals, and no-ELD-data copy are preserved. Guard:
`scripts/verify-hos-viewer-uses-paritytable.mjs` via verify-step **1066**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/compliance/HosViewerSection.tsx` | pages/compliance |
## qbo-parity-a1 — WorkOrdersConsoleListPage (this PR)
Maintenance work-orders console list was a hand-rolled `<table>` with inline error/loading
rows. Migrated to shared `ParityTable` (resize + gear + CSV export) and replaced the ad-hoc
error row with `ListErrorState` + Retry. Columns WO # / Billing / Class / Status / Est-Act /
Labor ¢ / Opened / Actions preserved 1:1; SecondaryNavTabs segment counts, billing/service
class/sort/search filters, server offset pagination, and `?sort=` URL persistence preserved.
Guard: `scripts/verify-wo-console-list-uses-paritytable.mjs` via verify-step **1093**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx` | pages/work-orders |

## qbo-parity-a1 — WorkOrderDetailPage (this PR)
WO detail had three hand-rolled `<table>` grids: posting-preview lines, linked bills,
and linked expenses. All three are read-only displays (the posting preview is a
PREVIEW ONLY — no journal entry is created or edited from this surface) — migrated to
shared `ParityTable` (sort + resize + gear). Columns Line / P&S Category / P&S Item /
Asset / Amount and Bill·Expense / Date / Status / Amount preserved 1:1; `EntityLink`
drill-through on bills/expenses, existing graceful backend-build outage banners, and
the `wo-linked-financials` section wrapper preserved. Guard:
`scripts/verify-wo-detail-uses-paritytable.mjs` via verify-step **1096**.

| File | Module |
| --- | --- |
| `apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx` | pages/maintenance |
