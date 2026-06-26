# TBL-STANDARD — Universal Table Sweep INVENTORY (Step 0)

The shared DataTable IS the single table standard. It landed on the Drivers list (#1235 alignment + #1227
page-size). This inventory catalogs every list surface as **SHARED** (already on the standard — leave it) vs
**BESPOKE** (raw `<table>` — migration target), so the remaining work is exact, not guessed. GUARD reviews
this before any migration. One PR per bespoke surface after approval.

## Reference (the standard — match it exactly, do NOT rebuild)
- Shared component: `apps/frontend/src/components/DataTable.tsx` (+ `apps/frontend/src/components/parity/ParityTable.tsx`).
- Reference consumption: `apps/frontend/src/pages/Drivers.tsx` (Drivers list — the locked alignment + page-size impl).
- Standard contract: center text/title columns, right-align numeric; universal rows-per-page; shared sort + column
  resize; QB-style calendar for date columns. Rules: `docs/specs/GLOBAL-SORT-RULE.md`,
  `docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md`.

## Scope reality (measured on main)
Across `apps/frontend/src/pages/**`: **20 surfaces already SHARED**, **254 contain a bespoke `<table>`**. The
254 includes the long tail (detail-embedded tables, modal/card mini-tables) — many of those are NOT primary list
surfaces and may not warrant the full DataTable contract (a 3-row card doesn't need pagination/sort). **GUARD
decides long-tail scope.** The actionable migration set is the **51 PRIMARY bespoke list surfaces** below.

### Module breakdown (SHARED / BESPOKE `<table>` files)
maintenance 13/18 · safety 2/37 · accounting 0/32 · reports 0/26 · dispatch 0/24 · lists 0/23 · factoring 0/9 ·
banking 0/8 · insurance 0/7 · driver-finance 0/7 · admin 0/6 · legal 0/5 · customers 0/4 · compliance 0/4 ·
profitability 0/4 · drivers 1/3 · finance 0/3 · fuel 0/3 · units 0/3 · (others 0–2). Maintenance is the most
standard-adopted module (the reference pattern to copy).

## PRIMARY bespoke list surfaces — migration targets (51), one PR each
Each: swap the bespoke `<table>` render for the shared DataTable, wiring existing columns/filters/actions/data —
ADDITIVE, zero feature loss; route + sidebar + endpoint UNCHANGED.

  - `accounting/BillPaymentsListPage.tsx`
  - `accounting/FactoringListPage.tsx`
  - `accounting/InvoicesListPage.tsx`
  - `accounting/ManualJEListPage.tsx`
  - `accounting/PaymentsListPage.tsx`
  - `accounting/bills/RecurringBillList.tsx`
  - `audit/AuditEventsList.tsx`
  - `banking/TransfersListPage.tsx`
  - `banking/components/RegisterTable.tsx`
  - `cash-advances/components/CashAdvancesTable.tsx`
  - `customers/CustomersListView.tsx`
  - `dispatch/components/LoadTable.tsx`
  - `dispatch/components/UnitsWithoutLoadTable.tsx`
  - `driver-finance/components/SettlementsTable.tsx`
  - `drivers/DriversTable.tsx`
  - `factoring/ChargebacksTable.tsx`
  - `factoring/RecoursePipelineTable.tsx`
  - `fuel/FuelTransactionsTable.tsx`
  - `fuel/components/StopReasoningTable.tsx`
  - `fuel/fraud-alerts/FraudAlertsList.tsx`
  - `insurance/PoliciesList.tsx`
  - `legal/matters/LegalMattersListPage.tsx`
  - `legal/templates/LegalTemplatesListPage.tsx`
  - `liabilities/components/LiabilitiesTable.tsx`
  - `lists/MaintenancePartsCatalog.tsx`
  - `lists/MaintenanceServicesCatalog.tsx`
  - `lists/accounting/AccountingCatalogListPage.tsx`
  - `lists/accounting/ItemsListPage.tsx`
  - `lists/accounting/QBOBulkLinkPage.tsx`
  - `lists/dispatch/DispatchCatalogListPage.tsx`
  - `lists/dispatch/LoadCancellationReasonsListPage.tsx`
  - `lists/driver/DriverCatalogListPage.tsx`
  - `lists/drivers/DriversReferenceCatalogPage.tsx`
  - `lists/drivers/TerminationReasonsListPage.tsx`
  - `lists/fleet/FleetCatalogListPage.tsx`
  - `lists/fuel/FuelCatalogListPage.tsx`
  - `lists/maintenance/MaintenanceCatalogListPage.tsx`
  - `lists/maintenance/OemPartsCatalog.tsx`
  - `lists/names/BrokersListPage.tsx`
  - `lists/names/NamesMasterHub.tsx`
  - `lists/safety/CargoClaimReasonsListPage.tsx`
  - `lists/safety/CivilFineTypesListPage.tsx`
  - `lists/safety/CompanyViolationTypesListPage.tsx`
  - `lists/safety/ComplaintTypesListPage.tsx`
  - `lists/safety/DotViolationTypesListPage.tsx`
  - `lists/safety/InternalFineReasonsListPage.tsx`
  - `payroll-integration/PayrollAggregateTable.tsx`
  - `reports/runners/RunnerTable.tsx`
  - `safety/components/SafetyEventsTable.tsx`
  - `vendors/VendorsListView.tsx`
  - `work-orders/WorkOrdersConsoleListPage.tsx`

## Recommended migration order (spec-named first, then by traffic)
1. **Dispatch** — `dispatch/components/LoadTable.tsx` (+ UnitsWithoutLoadTable) — the dispatch load list.
2. **Fleet** — `lists/fleet/FleetCatalogListPage.tsx` (+ fleet list surfaces).
3. **Insurance** — `insurance/PoliciesList.tsx`.
4. High-traffic ops: drivers/DriversTable, fuel/FuelTransactionsTable, customers/CustomersListView, vendors/VendorsListView.
5. Reports list surfaces (26) and `lists/*` catalogs (23) — bulk, lower-risk.
6. **Accounting/banking/factoring/finance list surfaces** — UI-render swap ONLY (no posting/data/behavior change);
   GUARD-prioritize since these are financial-adjacent surfaces (per §7) even though the change is pure-frontend.

## SHARED surfaces — already on the standard (do NOT touch)
Drivers.tsx, Documents.tsx, Users.tsx, drivers/SettlementDisputeList, inventory/InventoryPartsStockPage, and the
maintenance suite (ArrivingSoonPage, RoadServiceList, ServiceLocationPage, components/WorkOrdersTable,
PartsInventoryTable, InTransitIssuesTable, SevereRepairOosTab, MaintenanceDamageRegisterTab,
drivers/DriversMasterDataPage, parts/PartsMasterDataPage, vehicles/VehiclesMasterDataPage, vendors/VendorsPage,
DriverReportsQueuePage) + safety/components/DrugAlcoholTable, safety/components/TrainingTable.

## Acceptance for the sweep
Per surface: renders via shared DataTable; alignment + page-size + sort/resize correct; every pre-existing
column/filter/action preserved; route/sidebar/endpoint unchanged; nav-integrity green; GUARD live-verifies.
When all primary surfaces are migrated → TBL-STANDARD DONE; alignment + page-size + sort/resize consistent everywhere.
