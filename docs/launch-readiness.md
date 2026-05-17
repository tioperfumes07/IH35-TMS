# Launch Readiness Checklist

Generated from code and tracker evidence on `main` (branch base commit `0f41d67`).

Status legend:
- ✅ Done
- 🟡 Partial
- ❌ Not built
- ❓ Not verified

## Accounting

Overall: 🟡 Partial

- ✅ **Invoices**
  - Evidence: route `/accounting/invoices` and `/accounting/invoices/:id` exist in `apps/frontend/src/App.tsx`.
  - Evidence: components `InvoicesListPage` and `InvoiceDetailPage` are routed in `apps/frontend/src/App.tsx`.
- ✅ **Bills**
  - Evidence: routes `/accounting/bills` and `/accounting/bills/vendor` exist in `apps/frontend/src/App.tsx`.
  - Evidence: bill flow components exist in `apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx`.
- ✅ **Payments (Receive Payment)**
  - Evidence: route `/accounting/payments` and `/accounting/payments/:id` exist in `apps/frontend/src/App.tsx`.
  - Evidence: accounting sub-nav labels this entry as `Receive Payment` in `apps/frontend/src/pages/accounting/AccountingSubNav.tsx`.
  - Evidence: accounting hub section label is `Receive Payment (payment_method)` in `apps/frontend/src/pages/accounting/AccountingHubPage.tsx`.
- ✅ **Factoring**
  - Evidence: routes `/accounting/factoring` and `/accounting/factoring/:id` exist in `apps/frontend/src/App.tsx`.
- 🟡 **Expenses**
  - Evidence: route `/accounting/expenses` exists in `apps/frontend/src/App.tsx`.
  - Evidence: component memo explicitly says `Expense capture (Phase 1 placeholder until dedicated expense API ships)` in `apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx`.
- ❌ **Bill payments**
  - Evidence: `/accounting/bill-payments` is routed to `ComingSoonPage` in the `ComingSoonPage` route map in `apps/frontend/src/App.tsx`.
- ❌ **Vendor balances**
  - Evidence: `/accounting/vendor-balances` is routed to `ComingSoonPage` in `apps/frontend/src/App.tsx`.
- ❌ **Journal entries**
  - Evidence: `/accounting/journal-entries` is routed to `ComingSoonPage` in `apps/frontend/src/App.tsx`.

## Dispatch

Overall: 🟡 Partial

- ✅ **Book-load**
  - Evidence: route `/dispatch` exists in `apps/frontend/src/App.tsx`.
  - Evidence: `DispatchPage` mounts `BookLoadModal` in `apps/frontend/src/pages/Dispatch.tsx`.
  - Evidence: active v4 flow exists in `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx`; v3 is explicitly deprecated in `apps/frontend/src/pages/dispatch/components/BookLoadModalV3.deprecated.tsx`.
- ✅ **Lifecycle board/list**
  - Evidence: `DispatchPage` includes kanban/list modes and status mutation via `DispatchKanban`, `DispatchBoard`, and `useUpdateLoadStatus` in `apps/frontend/src/pages/Dispatch.tsx`.
- ❌ **Presettlement system**
  - Evidence: tracker `docs/trackers/phase-6.md` marks `P6-WF041-PRESETTLEMENT-SYSTEM` as `Deferred` and states `dispatch.presettlements table/service does not exist in repo`.

## Work Orders / Maintenance

Overall: 🟡 Partial

- ✅ **WO flows**
  - Evidence: routes `/maintenance`, `/maintenance/work-orders/:id`, and `/work-orders/:id` exist in `apps/frontend/src/App.tsx`.
  - Evidence: `CreateWorkOrderModal` includes save/create bill-expense flow and QBO posting note in `apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx`.
- ✅ **Bill/Expense/Accident-Damage money forms**
  - Evidence: components exist in:
    - `apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx`
    - `apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx`
    - `apps/frontend/src/pages/safety/components/AccidentReportDrawer.tsx`
- 🟡 **Fleet table**
  - Evidence: `Fleet table view is in active development.` text in `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx`.
- 🟡 **Service/location board**
  - Evidence: `Service / location board is in active development.` text in `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx`.
- 🟡 **WO detail integration**
  - Evidence: toast text `WO detail drawer integration is pending follow-up` in `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx`.

## Banking

Overall: 🟡 Partial

- ✅ **Accounts**
  - Evidence: route `/banking` exists in `apps/frontend/src/App.tsx`.
  - Evidence: `BankingHomePage` renders `AccountTilesRow`, `ManageAccountsModal`, and Plaid connect actions in `apps/frontend/src/pages/banking/BankingHome.tsx`.
- ✅ **Transactions/Categorization**
  - Evidence: `BankingHomePage` renders `RegisterTable`, `RegisterToolbar`, `BankingReviewCenter`, `CategorizeDrawer` in `apps/frontend/src/pages/banking/BankingHome.tsx`.
- ✅ **Reconciliation**
  - Evidence: routes `/banking/reconcile` and `/banking/reconciliation` exist in `apps/frontend/src/App.tsx`.
  - Evidence: reconciliation API/match/unmatch/complete routes exist in `apps/backend/src/banking/reconciliation.routes.ts`.
- ✅ **Transfers**
  - Evidence: route `/banking/transfers` exists in `apps/frontend/src/App.tsx`.
  - Evidence: `View Transfers` action in `apps/frontend/src/pages/banking/BankingHome.tsx`.
- ❌ **Driver escrow page**
  - Evidence: no `/banking/driver-escrow` route in `apps/frontend/src/App.tsx`.
  - Evidence: no banking escrow page component under `apps/frontend/src/pages/banking` matching `*Escrow*.tsx`.
- ❌ **Banking reports page**
  - Evidence: no `/banking/reports` route in `apps/frontend/src/App.tsx`.
  - Evidence: no banking reports page component under `apps/frontend/src/pages/banking`.

## Fuel, Drivers / Settlements, Safety

Overall: 🟡 Partial

- ✅ **Fuel**
  - Evidence: route `/fuel` exists in `apps/frontend/src/App.tsx`.
  - Evidence: planner module `FuelPlannerHomePage` with subnav and API-backed sections exists in `apps/frontend/src/pages/fuel/FuelPlannerHome.tsx`.
- 🟡 **Drivers**
  - Evidence: route `/drivers` and `/drivers/:id` exist in `apps/frontend/src/App.tsx`.
  - Evidence: `DriversPage` includes functional list/create/team flows, but KPI/data panels are hardcoded display values (for example `62/70`, `$84,200`) in `apps/frontend/src/pages/Drivers.tsx`.
- ✅ **Settlements**
  - Evidence: route `/driver-finance/settlements` exists in `apps/frontend/src/App.tsx`.
  - Evidence: `SettlementsPage` queries `listSettlements` and exposes list/detail/disputes in `apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`.
- 🟡 **Safety**
  - Evidence: route `/safety` plus many nested tabs exists in `apps/frontend/src/App.tsx`.
  - Evidence: `SafetyHomePage` displays: `This tab is available in v5 shell and will be expanded with dedicated workflows.` for HOS/Vehicle/Liabilities/Integrity/Settings tabs in `apps/frontend/src/pages/safety/SafetyHome.tsx`.

## QBO Sync / Import Parity (Both Companies)

Overall: ❓ Not verified

- ✅ **QBO sync surfaces and jobs exist**
  - Evidence: route `/qbo/sync-dashboard` exists in `apps/frontend/src/App.tsx`.
  - Evidence: forensic import pipeline (entities, transactions, attachments) exists in `apps/backend/src/integrations/qbo/forensic-import.service.ts`.
  - Evidence: scheduled master-data sync supports both company codes (`TRK` always, `TRANSP` when `QBO_MASTERDATA_TRANSP_ENABLED=1`) in `apps/backend/src/qbo/master-data-sync.service.ts`.
- ✅ **Banking reconciliation -> QBO sync queue path exists**
  - Evidence: reconciliation complete path enqueues sync jobs (`enqueueSyncJob`) in `apps/backend/src/banking/reconciliation.routes.ts`.
- ❓ **Parity proof not present**
  - Evidence: no checked-in QBO-vs-IH35 parity report artifact found in `tests/results` (only smoke/perf/runbook outputs are present).

### IH 35 Transportation QBO Import Parity Statement

Current status: ❓ Not verified.

Required reconciliation report (must be produced before marking parity as verified):
- For each entity (at minimum `Account`, `Customer`, `Vendor`, `Item`, `Class`, and each imported transaction type): QBO count vs IH35 mirrored count.
- For each transaction entity: QBO amount totals vs IH35 amount totals (same date windows and same operating company scope).
- Mismatch list with record-level identifiers (`qbo_id`/transaction id), category of mismatch (missing in IH35, missing in QBO mirror, amount mismatch, status mismatch), and company code (`TRANSP` or `TRK`).

## Phase 7 Hardening (Seed, Smoke, E2E)

Overall: 🟡 Partial

- ❌ **Seed**
  - Evidence: open backlog items in `docs/trackers/phase-7.md`: `P7-FIX-SEED-001`, `P7-FIX-SEED-002`, `P7-FIX-SEED-003`.
- 🟡 **Smoke**
  - Evidence: `docs/trackers/phase-7.md` marks production smoke authenticated checks as `SKIPPED` for `P7-PROD-SMOKE-001`.
  - Evidence: `tests/results/prod-smoke-2026-05-14.md` states prod cookie/company env vars were not available and checks were skipped.
- ❌ **E2E hardening completion**
  - Evidence: `P7-SCHEDULED-REPORT-E2E-001` remains listed in Phase 7 backlog (`docs/trackers/phase-7.md`).

## Explicit Callout: Routes Pointing to ComingSoon or Placeholder Flow

### Direct `ComingSoonPage` routes

From `apps/frontend/src/App.tsx`:
- `/lists/:domain` -> `ComingSoonPage`
- `/lists/:domain/:catalogKey` -> `ComingSoonPage`
- `/coming-soon` -> `ComingSoonPage`
- `/dispatch/loads` -> `ComingSoonPage`
- `/dispatch/geofencing` -> `ComingSoonPage`
- `/dispatch/factoring-packets` -> `ComingSoonPage`
- `/dispatch/incidents` -> `ComingSoonPage`
- `/maintenance/work-orders` -> `ComingSoonPage`
- `/maintenance/parts-inventory` -> `ComingSoonPage`
- `/maintenance/severe-repairs` -> `ComingSoonPage`
- `/maintenance/triage` -> `ComingSoonPage`
- `/maintenance/in-transit` -> `ComingSoonPage`
- `/fuel/planner` -> `ComingSoonPage`
- `/fuel/settings` -> `ComingSoonPage`
- `/fuel/inbox` -> `ComingSoonPage`
- `/safety/accidents-incidents` -> `ComingSoonPage`
- `/safety/integrity-alerts` -> `ComingSoonPage`
- `/safety/permits` -> `ComingSoonPage`
- `/safety/trailer-interchanges` -> `ComingSoonPage`
- `/drivers/settlements` -> `ComingSoonPage`
- `/drivers/permits` -> `ComingSoonPage`
- `/accounting/bill-payments` -> `ComingSoonPage`
- `/accounting/vendor-balances` -> `ComingSoonPage`
- `/accounting/journal-entries` -> `ComingSoonPage`
- `/factoring/faro-imports` -> `ComingSoonPage`
- `/factoring/equipment-loans` -> `ComingSoonPage`
- `/factoring/vendor-merges` -> `ComingSoonPage`

### Placeholder redirect flow (to `/coming-soon`)

From `apps/frontend/src/App.tsx`:
- `/catalogs/accounts` -> `Navigate` to `/coming-soon?...`
- `/catalogs/classes` -> `Navigate` to `/coming-soon?...`
- `/catalogs/items` -> `Navigate` to `/coming-soon?...`
- `/catalogs/payment-terms` -> `Navigate` to `/coming-soon?...`
- `/catalogs/posting-templates` -> `Navigate` to `/coming-soon?...`
- `/catalogs/account-role-bindings` -> `Navigate` to `/coming-soon?...`

## Explicit Callout: Tracker Items Marked Deferred / Skipped / "in active development" / "pending follow-up"

### Deferred (tracker rows)

- `docs/trackers/phase-0.md` L37  
  `| ... | ... deferred to Phase 2 entry ... | ... | Deferred — decide at Phase 2 entry | ... |`
- `docs/trackers/phase-3.md` L42  
  `| ... | Deferred deep-tab parity for Module 7 Driver Detail ... | ... | Deferred | ... |`
- `docs/trackers/phase-6.md` L5  
  `| ... | P6-WF041-PRESETTLEMENT-SYSTEM | ... | Deferred | ... does not exist in repo ... |`

### Skipped

- `docs/trackers/phase-7.md` L22  
  `... authenticated checks SKIPPED until BLOCK_X_PROD_COOKIE + BLOCK_X_PROD_OPERATING_COMPANY_ID are set locally`

### "in active development" / "pending follow-up" tracker rows

- No exact tracker rows containing those exact status phrases were found in `docs/trackers`.
- Those phrases do appear in runtime UI copy (for example `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx`), but not as tracker row statuses.
