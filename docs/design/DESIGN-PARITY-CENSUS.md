# DESIGN-PARITY-CENSUS

Generated: 2026-11-10T02:00:32.748Z
Source order: ROUND 8.4 UI-F11125 · owner design law · docs/design/v3 (50) · boards (banking, driver-customers-vendors, maintenance, settlements) · approved-screens (13).

## Totals

| Metric | Count |
|---|---:|
| Routes in manifest | 687 |
| Passing (static app-wide rules) | 639 |
| Failing (rule hits on resolved pages) | 48 |
| Unresolved page binding (informational) | 219 |
| v3 .dc.html designs | 50 |
| Board sets | 4 |
| Approved screens | 13 |

## Fail rule hits

| Rule | Hits |
|---|---:|
| coming_soon_stub | 5 |
| status_select_not_multiselect | 0 |
| missing_em_dash_empty | 0 |
| parity_table_without_export_or_gear | 43 |
| unresolved_page | 219 |

## Per module

| Module | Routes | Passing | Failing | Unresolved |
|---|---:|---:|---:|---:|
| 425c | 2 | 2 | 0 | 0 |
| accounting | 94 | 78 | 16 | 18 |
| admin | 17 | 16 | 1 | 2 |
| api | 1 | 1 | 0 | 0 |
| app | 1 | 1 | 0 | 1 |
| apply | 1 | 1 | 0 | 0 |
| attorney-review | 1 | 1 | 0 | 0 |
| audit | 1 | 1 | 0 | 1 |
| banking | 27 | 25 | 2 | 3 |
| cash-advances | 1 | 1 | 0 | 0 |
| cash-flow | 1 | 1 | 0 | 0 |
| catalogs | 9 | 9 | 0 | 7 |
| coming-soon | 1 | 0 | 1 | 0 |
| compliance | 4 | 4 | 0 | 0 |
| customers | 3 | 1 | 2 | 0 |
| daily-tasks | 1 | 1 | 0 | 0 |
| dev | 2 | 2 | 0 | 1 |
| dispatch | 51 | 51 | 0 | 15 |
| docs | 1 | 1 | 0 | 0 |
| documents | 1 | 0 | 1 | 0 |
| driver | 7 | 7 | 0 | 5 |
| driver-app | 1 | 1 | 0 | 0 |
| driver-finance | 20 | 17 | 3 | 2 |
| driver-hub | 2 | 2 | 0 | 0 |
| drivers | 24 | 23 | 1 | 15 |
| eld | 1 | 1 | 0 | 0 |
| factoring | 35 | 34 | 1 | 28 |
| feed-gate | 2 | 2 | 0 | 0 |
| finance | 13 | 13 | 0 | 1 |
| finance-hub | 1 | 1 | 0 | 1 |
| fleet | 8 | 7 | 1 | 2 |
| form-425c | 1 | 1 | 0 | 1 |
| fuel | 17 | 17 | 0 | 15 |
| help | 4 | 4 | 0 | 0 |
| home | 3 | 3 | 0 | 3 |
| insurance | 2 | 2 | 0 | 0 |
| integrations | 3 | 3 | 0 | 0 |
| inventory | 3 | 3 | 0 | 0 |
| legal | 14 | 12 | 2 | 0 |
| liabilities | 1 | 1 | 0 | 0 |
| lists | 96 | 89 | 7 | 8 |
| loads | 1 | 1 | 0 | 1 |
| login | 3 | 3 | 0 | 0 |
| maintenance | 45 | 44 | 1 | 21 |
| notifications | 1 | 1 | 0 | 0 |
| onboarding | 1 | 1 | 0 | 0 |
| owner-approval | 1 | 1 | 0 | 0 |
| portal | 5 | 5 | 0 | 5 |
| profitability | 1 | 1 | 0 | 0 |
| program | 8 | 8 | 0 | 1 |
| pwa | 1 | 1 | 0 | 0 |
| qbo | 1 | 1 | 0 | 0 |
| reports | 60 | 54 | 6 | 3 |
| root | 1 | 1 | 0 | 1 |
| safety | 57 | 57 | 0 | 56 |
| samsara | 3 | 3 | 0 | 0 |
| settings | 3 | 3 | 0 | 1 |
| settlements | 1 | 1 | 0 | 1 |
| sign | 1 | 1 | 0 | 0 |
| system | 2 | 2 | 0 | 0 |
| tasks | 6 | 6 | 0 | 0 |
| users | 2 | 1 | 1 | 0 |
| vendors | 3 | 2 | 1 | 0 |
| work-orders | 2 | 1 | 1 | 0 |

## Failing routes (static)

| Route | Module | Design source | Page | Fails |
|---|---|---|---|---|
| `/accounting` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/AccountingHubPage.tsx | parity_table_without_export_or_gear |
| `/accounting/transactions` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx | parity_table_without_export_or_gear |
| `/accounting/reclassify` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx | parity_table_without_export_or_gear |
| `/accounting/batch-transactions` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/batch/BatchExpensesPage.tsx | parity_table_without_export_or_gear |
| `/accounting/abandonment-queue` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx | parity_table_without_export_or_gear |
| `/accounting/audit-trail` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx | parity_table_without_export_or_gear |
| `/accounting/escrow` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/EscrowPage.tsx | parity_table_without_export_or_gear |
| `/accounting/unexpected` | accounting | v3:Accounting-Unexpected.dc.html | apps/frontend/src/pages/accounting/UnexpectedExpensesPage.tsx | parity_table_without_export_or_gear |
| `/accounting/bills/vendor` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx | parity_table_without_export_or_gear |
| `/accounting/checks` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/checks/CheckListPage.tsx | parity_table_without_export_or_gear |
| `/accounting/vendor-credits` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/VendorCreditsPage.tsx | parity_table_without_export_or_gear |
| `/accounting/credit-memos` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/CreditMemosPage.tsx | parity_table_without_export_or_gear |
| `/accounting/journal-entries` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/ManualJEListPage.tsx | parity_table_without_export_or_gear |
| `/accounting/receipts` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/ReceiptsPage.tsx | parity_table_without_export_or_gear |
| `/accounting/prepaid-expenses` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx | parity_table_without_export_or_gear |
| `/accounting/account-type-catalog` | accounting | v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money) | apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx | parity_table_without_export_or_gear |
| `/admin/observability` | admin | app-wide rules only | apps/frontend/src/pages/admin/ObservabilityPage.tsx | parity_table_without_export_or_gear |
| `/banking/deposits` | banking | v3:Banking.dc.html + approved:04-banking.png + board:banking | apps/frontend/src/pages/banking/MakeDepositPage.tsx | parity_table_without_export_or_gear |
| `/banking/deposits/:id` | banking | v3:Banking.dc.html + approved:04-banking.png + board:banking | apps/frontend/src/pages/banking/DepositDetailPage.tsx | parity_table_without_export_or_gear |
| `/coming-soon` | coming-soon | app-wide rules only | apps/frontend/src/pages/ComingSoonPage.tsx | coming_soon_stub |
| `/customers` | customers | v3:Customers.dc.html + board:driver-customers-vendors | apps/frontend/src/pages/Customers.tsx | coming_soon_stub |
| `/customers/:id/statement` | customers | v3:Customers.dc.html + board:driver-customers-vendors | apps/frontend/src/pages/reports/CounterpartyStatementPage.tsx | parity_table_without_export_or_gear |
| `/documents` | documents | app-wide rules only | apps/frontend/src/pages/Documents.tsx | parity_table_without_export_or_gear |
| `/driver-finance/settlements` | driver-finance | v3:Settlements*.dc.html + board:settlements | apps/frontend/src/pages/driver-finance/SettlementsPage.tsx | parity_table_without_export_or_gear |
| `/driver-finance/settlements/batch` | driver-finance | v3:Settlements*.dc.html + board:settlements | apps/frontend/src/pages/driver-finance/BatchSettlementsPage.tsx | parity_table_without_export_or_gear |
| `/driver-finance/escrow/:driverId` | driver-finance | v3:Settlements*.dc.html + board:settlements | apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx | parity_table_without_export_or_gear |
| `/drivers/duplicates` | drivers | v3:DriverProfile.dc.html + approved:07-drivers.png + board:driver-customers-vendors | apps/frontend/src/pages/drivers/DriverDuplicatesPage.tsx | parity_table_without_export_or_gear |
| `/factoring/faro-debtors/:name` | factoring | v3:Factoring.dc.html | apps/frontend/src/pages/factoring/FaroDebtorRecordPage.tsx | parity_table_without_export_or_gear |
| `/fleet/units/:id` | fleet | board:maintenance (fleet table) + approved:02-maintenance.png | apps/frontend/src/pages/fleet/VehicleProfilePage.tsx | coming_soon_stub |
| `/legal/contracts` | legal | v3:Legal.dc.html | apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx | parity_table_without_export_or_gear |
| `/legal/templates` | legal | v3:Legal.dc.html | apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx | parity_table_without_export_or_gear |
| `/lists/names` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/lists/names/NamesMasterHub.tsx | parity_table_without_export_or_gear |
| `/lists/maintenance/oem-parts-reference` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx | parity_table_without_export_or_gear |
| `/lists/maintenance/parts-catalog` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx | parity_table_without_export_or_gear |
| `/lists/maintenance/services-catalog` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx | parity_table_without_export_or_gear |
| `/lists/accounting/account-types` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx | parity_table_without_export_or_gear |
| `/lists/accounting/posting-templates` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/lists/accounting/PostingTemplatesListPage.tsx | parity_table_without_export_or_gear |
| `/lists/accounting/items` | lists | approved:09-lists-catalogs.png | apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx | parity_table_without_export_or_gear |
| `/maintenance/work-orders` | maintenance | v3:Maintenance-Home.dc.html + approved:02-maintenance.png + board:maintenance | apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx | parity_table_without_export_or_gear |
| `/reports/management` | reports | v3:Reports*.dc.html + approved:10-reports.png | apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx | parity_table_without_export_or_gear |
| `/reports/trial-balance` | reports | v3:Reports*.dc.html + approved:10-reports.png | apps/frontend/src/pages/reports/TrialBalancePage.tsx | parity_table_without_export_or_gear |
| `/reports/profit-loss` | reports | v3:Reports*.dc.html + approved:10-reports.png | apps/frontend/src/pages/reports/ProfitLossPage.tsx | parity_table_without_export_or_gear |
| `/reports/balance-sheet` | reports | v3:Reports*.dc.html + approved:10-reports.png | apps/frontend/src/pages/reports/BalanceSheetPage.tsx | parity_table_without_export_or_gear |
| `/reports/cash-flow-statement` | reports | v3:Reports*.dc.html + approved:10-reports.png | apps/frontend/src/pages/reports/CashFlowStatementPage.tsx | parity_table_without_export_or_gear |
| `/reports/scheduled` | reports | v3:Reports*.dc.html + approved:10-reports.png | apps/frontend/src/pages/reports/SubscriptionManager.tsx | coming_soon_stub |
| `/users` | users | app-wide rules only | apps/frontend/src/pages/Users.tsx | coming_soon_stub |
| `/vendors/:id/statement` | vendors | v3:Vendors.dc.html + board:driver-customers-vendors | apps/frontend/src/pages/reports/CounterpartyStatementPage.tsx | parity_table_without_export_or_gear |
| `/work-orders` | work-orders | app-wide rules only | apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx | parity_table_without_export_or_gear |

## Notes

- A route PASSes this census when the static app-wide rules above hold on its resolved page source.
- Element-level FULL design coverage (every tab/KPI/column vs its .dc.html) is the BUILD phase (one PR per module); this census is the ratchet floor.
- `failing_routes` in scripts/design-parity-census-baseline.json may only go down (`--lower`).
