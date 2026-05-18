# IH35 ERP/TMS — QBO Operational Depth Current-State Audit

## 1. Scope
This audit compares current implementation in this repository against QuickBooks-style accounting depth and trucking ERP operational requirements. It is a documentation-only current-state assessment based on actual routes, page components, backend services, and migrations; it does not change design or production behavior.

## 2. Current design rule
- Current production IH35 UI remains the design authority.
- No restyling is in scope.
- No colorful/tutti-frutti redesign is in scope.
- Old mockups/screenshots are workflow references only, not visual design sources.

## 3. Already built — do not rebuild
Status legend: COMPLETE / PARTIAL / NOT FOUND.

1) Universal searchable combobox — COMPLETE  
- `apps/frontend/src/components/Combobox.tsx`  
- `apps/frontend/src/components/shared/SelectCombobox.tsx`  
- `apps/frontend/src/components/forms/QboCombobox.tsx`

2) Responsive accounting table/grid foundation — COMPLETE  
- Accounting list/detail tables are implemented across:  
  - `apps/frontend/src/pages/accounting/BillsPage.tsx`  
  - `apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx`  
  - `apps/frontend/src/pages/accounting/VendorBalancesPage.tsx`  
  - `apps/frontend/src/pages/accounting/ManualJEListPage.tsx`  
  - `apps/frontend/src/pages/accounting/FactoringListPage.tsx`

3) Vendor profile balances — COMPLETE  
- Route: `/vendors` (`VendorsPage`) shows open/overdue balance summary and transaction list.

4) Customer profile balances — COMPLETE  
- Route: `/customers` (`CustomersPage`) shows open/overdue balance summary and transaction list.

5) Vendor/customer transaction lists — COMPLETE  
- Routes: `/vendors`, `/customers`, `/vendors/:id`, `/customers/:id`  
- Files include pagination, filters, and transaction-oriented tabs.

6) Vendor/customer filters — COMPLETE  
- `VendorsPage` and `CustomersPage` use searchable/filterable controls including `SelectCombobox`.

7) Pre-settlements pages — COMPLETE  
- Route `/accounting/pre-settlements` (`AccountingPreSettlementsPage`)  
- Dispatch uses `PreSettlementsPanel` in `DispatchPage`.

8) Factoring profile/customer/vendor quality fields — COMPLETE  
- Factoring profile editing: `apps/frontend/src/pages/factoring/FactoringHome.tsx`  
- Customer quality/factoring fields: `apps/frontend/src/pages/CustomerDetail.tsx`  
- Vendor quality fields: `apps/frontend/src/pages/VendorDetail.tsx`

9) Multi-company support — COMPLETE  
- Frontend company context + selector: `apps/frontend/src/contexts/CompanyContext.tsx`  
- Backend routes consume `operating_company_id` widely; company scope enforced in services/routes.

10) QBO mirror/projection/import concepts — COMPLETE  
- Projection link migration: `db/migrations/0193_qbo_master_data_projection_links.sql`  
- Projection/transp migration: `db/migrations/0194_qbo_master_data_projection_transp.sql`  
- QBO sync stack exists under `apps/backend/src/integrations/qbo/*`

## 4. Current accounting route map
Status legend: real page / partial page / placeholder/ComingSoon / missing route.

- Vendors  
  - `/vendors` real page  
  - `/vendors/:id` real page  
  - `/accounting/vendors` missing route (sub-nav points here)
- Customers  
  - `/customers` real page  
  - `/customers/:id` real page  
  - `/accounting/customers` missing route (sub-nav points here)
- Bills  
  - `/accounting/bills` real page  
  - `/accounting/bills/vendor` real page  
  - `/accounting/bills/maintenance|repair|fuel|driver|multiple` missing routes (sub-nav entries exist)
- Bill payments  
  - `/accounting/bill-payments` real page
- Vendor balances  
  - `/accounting/vendor-balances` real page
- Journal entries  
  - `/accounting/journal-entries` real page
- Invoices  
  - `/accounting/invoices` real page  
  - `/accounting/invoices/:id` real page
- Expenses  
  - `/accounting/expenses` partial page (explicitly phase placeholder using vendor bills API)
- Chart of accounts  
  - `/lists/accounting/chart-of-accounts` real page  
  - `/catalogs/accounts` placeholder redirect to coming-soon  
  - `/accounting/chart-of-accounts` missing route
- Products/services  
  - `/lists/accounting/items` real page  
  - `/catalogs/items` placeholder redirect to coming-soon  
  - `/accounting/products-services` missing route
- Banking  
  - `/banking` real page  
  - `/banking/reconcile` real page  
  - `/banking/reconciliation` real page
- Driver escrow  
  - inside `/banking` (Driver Escrow tab content) real feature  
  - `/accounting/driver-escrow` missing route
- Factoring packets  
  - `/dispatch/factoring-packets` placeholder/ComingSoon  
  - no dedicated operational factoring packet route found
- Presettlements  
  - `/accounting/pre-settlements` real page  
  - dispatch tab integration real
- Settlements  
  - `/driver-finance/settlements` real page  
  - settlement detail real (query-param driven)

## 5. Data problem vs feature problem
### DATA PROBLEM
- QBO-driven screens can appear sparse/empty when no projected mirror data exists for a company (depends on successful mirror/projection import population).
- Some route surfaces rely on live accounting/factoring/banking data that may be absent in lower environments despite working code paths.

### FEATURE/SYSTEM PROBLEM
- No dedicated expense engine yet (`ExpenseCreatePage` persists via vendor bill pathway).
- Multiple accounting sub-nav targets are not routable pages yet (`/accounting/vendors`, `/accounting/customers`, `/accounting/reports`, bill subtype paths).
- Dispatch factoring packet route remains `ComingSoon`.
- No dedicated end-user posting/traceability ledger experience across all accounting flows.

## 6. Missing operational accounting linkages
Status legend: COMPLETE / PARTIAL / NOT FOUND / BLOCKED BY DATA.

- Load -> Customer Invoice -> AR: COMPLETE  
  - `apps/backend/src/accounting/from-load.ts` creates invoice/line idempotently from load.
- Load -> Driver Bill -> Settlement: PARTIAL  
  - Driver bill artifacts + settlement surfaces exist; presettlement link from booking is deferred (TODO in `book-load.service.ts`).
- Load -> Fuel Expense: PARTIAL  
  - Fuel planning exists; direct fuel-to-accounting expense posting engine is not evident.
- Load -> Factoring Packet: PARTIAL  
  - Outbox event exists (`dispatch.factoring_packet`), but dispatch packet operations page is missing.
- Maintenance WO -> Vendor Bill: COMPLETE  
  - `work-orders.routes.ts` auto-create bill/expense paths and validation.
- Driver Settlement -> Debt/Escrow/Deductions: COMPLETE  
  - Debt recompute endpoint + settlement detail debt/escrow/deduction controls are live.
- Bank Transaction -> Match/Reconcile/Post: PARTIAL  
  - Suggestions/split/undo/reconcile workspace exists; full posting workflow parity appears incomplete.
- QBO transaction -> Local ledger mirror: PARTIAL  
  - Strong sync/mirror infrastructure exists; full operational parity depends on data completeness and linkage coverage.

## 7. Missing QuickBooks parity behaviors
### Vendors
- Aging: PARTIAL (`/reports/ap-aging` exists, not integrated as vendor workbench parity).  
- Open balance: COMPLETE (`/vendors`, `/accounting/vendor-balances`).  
- Overdue balance: COMPLETE (`VendorsPage` summary).  
- Vendor details: COMPLETE (`/vendors/:id`).  
- Payment terms: PARTIAL (terms lists/config exist, uneven surfaced editing per workflow).  
- Attachments: COMPLETE at platform level (`DocumentsTab`, attachments API), PARTIAL in accounting-specific bill views.  
- Transactions: COMPLETE (vendor transaction lists).  
- Filters: COMPLETE (list-level filters present).

### Customers
- Aging: PARTIAL (`/reports/ar-aging` exists, not full customer statement center parity).  
- Open balance: COMPLETE (`/customers`).  
- Overdue balance: COMPLETE (`CustomersPage`).  
- Customer details: COMPLETE (`/customers/:id`).  
- Statements: PARTIAL (reporting present; dedicated statements workflow not fully explicit).  
- Invoices/payments/deposits: PARTIAL (invoices/payments present; deposit parity less explicit).  
- Transactions: COMPLETE.  
- Filters: COMPLETE.

### Bills
- unpaid/paid/for review tabs: PARTIAL (status filtering exists; explicit QB-style tabbed IA not full).  
- schedule payment: COMPLETE (`BillPaymentsListPage` + `PayBillModal`).  
- mark paid: COMPLETE (record payment flows).  
- split categories: PARTIAL (bank split exists; bill-line category split parity not complete).  
- attachments: PARTIAL (backend supports `bill`, UI attachment panel not embedded on bills page).  
- trucking custom fields: PARTIAL (some fields appear across modules, not full bill parity set).  
- recurring bills: NOT FOUND.

### Invoices
- accessorials: PARTIAL (custom invoice line creation exists).  
- detention: PARTIAL (detention data appears in load booking; dedicated invoice parity behaviors are incomplete).  
- lumper: PARTIAL (line-level flexibility exists; no explicit lumper workflow parity).  
- fuel surcharge: PARTIAL (line entries possible, no explicit surcharge engine parity).  
- load linkage: COMPLETE (`source_load_id` flow in backend).  
- factoring packet linkage: PARTIAL (factoring features exist; dispatch packet workflow gap remains).

### Expenses
- payee/category/date/status filters: PARTIAL (expense page is creation-focused placeholder).  
- inline category edit: NOT FOUND.  
- receipt attachments: PARTIAL (attachments platform supports `expense`; accounting expense UI embedding is limited).  
- QBO match/reconcile behavior: PARTIAL.

## 8. Trucking-specific gaps
- driver debt engine: COMPLETE (debt recompute endpoint + settlement UI).  
- deductions: COMPLETE (settlement deductions + hold/pending ack handling).  
- escrow ledger: COMPLETE (banking escrow tab + timeline/register).  
- cash advances: PARTIAL (module present; full accounting linkage depth still evolving).  
- fuel advances: PARTIAL (fuel + settlements exist; dedicated accounting advance engine not explicit).  
- negative settlements: PARTIAL (payment states/disputes exist; exhaustive policy handling not fully evident).  
- team split settlements: PARTIAL (team split preview/lines visible; full lifecycle parity still evolving).  
- settlement holds: COMPLETE (hold deduction controls).  
- settlement disputes: COMPLETE (open dispute flow + dispute categories).  
- factoring packet lifecycle: PARTIAL (accounting/factoring exists; dispatch packet route missing).  
- detention billing: PARTIAL (detention fields exist in load booking; complete billing automation parity incomplete).  
- layover billing: PARTIAL (line flexibility exists; explicit layover workflow parity not obvious).  
- lumper passthrough: PARTIAL (possible via line/manual flows; explicit dedicated path not obvious).  
- load profitability: PARTIAL (reporting exists; comprehensive operational profitability workflow unclear).  
- truck profitability: PARTIAL (`/reports/profit-per-truck` exists).  
- driver profitability: PARTIAL (some driver finance/reporting data exists; dedicated profitability page not explicit).

## 9. Validation/gating gaps
Validation presence before actions:
- dispatching a load: PARTIAL (status transition validations + required cancellation reasons exist; deeper accounting readiness gates not complete).
- creating invoice: PARTIAL (load-based invoice creation validates load/company existence; broader policy gating limited).
- creating driver bill: PARTIAL (artifacts are generated in load flow; explicit preflight UI gating limited).
- approving settlement: COMPLETE/PARTIAL (finalize blocks on pending ack, debt stale, acknowledgment; broader business-policy variants may still be partial).
- paying driver: PARTIAL (state machine exists; bank settlement controls are present but not full external reconciliation guardrail parity).
- posting journal entry: PARTIAL (manual JE create/void exists; explicit posting pre-check matrix not fully surfaced).
- syncing to QBO: PARTIAL (sync infrastructure and routes exist; strict pre-sync gating parity across all entities not fully evident).
- reconciling bank transaction: PARTIAL (reconciliation workspace + split/undo present; full match/reconcile/post enforcement parity remains partial).

## 10. Document/attachment/OCR gaps
- attachments on bills: PARTIAL (backend supports `bill`; bills page lacks embedded attachments panel).
- attachments on expenses: PARTIAL (backend supports `expense`; expense page is placeholder and not attachment-rich).
- POD/BOL support: COMPLETE at attachment taxonomy/API level (`category` includes `pod`, `bol`).
- factoring packet documents: PARTIAL (attachment primitives exist; dispatch factoring packet page missing).
- maintenance documents: PARTIAL (attachment system supports entities; maintenance-centric document UX not fully centralized).
- driver documents: COMPLETE (`DocumentsTab` reusable + driver entity support).
- vendor/customer documents: COMPLETE (`VendorDetail`/`CustomerDetail` use `DocumentsTab`).
- OCR/import pipeline: PARTIAL (`/api/v1/ocr/rate-confirmation/:attachment_id` exists; broader OCR pipeline not generalized).
- document tagging: PARTIAL (categories + metadata exist; richer operational tagging workflows are limited).

## 11. Verification and CI guards
Commands required by this audit and status:
- `npm run build:backend` (run in this task)
- `(cd apps/frontend && npx tsc -b)` (run in this task)
- `npm run verify:arch-design` (run in this task)

Current guard/verification scripts found:
- `verify:arch-design` (composes UI regressions, banking visibility, responsive layout, route lint)
- `verify:ui-regressions`
- `verify:banking-data-visibility`
- `verify:responsive-layout`
- `lint:fastify-routes`
- `verify:canonical-schema-names`
- `verify:test-insert-columns`
- `verify:schema-usage-grants`

New guards recommended (not implemented here):
- guard for unresolved accounting sub-nav routes (prevent links to non-registered routes)
- guard for `ComingSoon` routes in operational accounting paths
- guard for attachment surface coverage on accounting detail pages
- guard ensuring expense flow is not permanently bill-placeholder backed
- guard for factoring-packet dispatch route parity with backend events

## 12. Prioritized next build sequence
Do not implement in this audit. Sequence recommendation only.

### Priority 0 — Data foundation
1) Ensure repeatable QBO projection/import readiness per operating company  
- reason: many partials are data-sparse symptoms even with existing UI/services  
- dependency: QBO sync credentials + projection jobs + environment readiness  
- estimated size: medium  
- suggested branch name: `data/qbo-projection-readiness-guards`  
- suggested verification guard: `verify:qbo-projection-health` (new)

### Priority 1 — Must build next
1) Close accounting sub-nav routing parity gaps (`/accounting/vendors`, `/accounting/customers`, bill subtype destinations, `/accounting/reports`)  
- reason: high user friction, low risk, mostly wiring/route integrity  
- dependency: route registration + mapping to existing pages  
- estimated size: small  
- suggested branch name: `feat/accounting-subnav-route-parity`  
- suggested verification guard: `verify:accounting-route-map` (new)

2) Replace expense placeholder path with dedicated expense API flow  
- reason: expense is currently explicit phase placeholder  
- dependency: backend expense endpoints + UI mutation/query refactor  
- estimated size: medium  
- suggested branch name: `feat/accounting-expense-engine-phase1`  
- suggested verification guard: `verify:expense-engine-not-bill-backed` (new)

### Priority 2 — Operational accounting engine
1) Add posting/traceability views for JE, bills, invoices, settlement-linked accounting events  
- reason: improves auditability and QBO parity confidence  
- dependency: unified posting/audit query surfaces  
- estimated size: large  
- suggested branch name: `feat/accounting-posting-traceability`  
- suggested verification guard: `verify:posting-trace-coverage` (new)

### Priority 3 — Settlement/debt/escrow engine
1) Complete pre-settlement linkage from load booking and normalize team/negative settlement rules  
- reason: core trucking payout reliability  
- dependency: load->presettlement lookup + settlement policy codification  
- estimated size: medium  
- suggested branch name: `feat/settlement-presettlement-link-and-rules`  
- suggested verification guard: `verify:settlement-gates` (new)

### Priority 4 — Document/OCR engine
1) Embed attachments in accounting detail pages + broaden OCR beyond rate confirmations  
- reason: closes operational documentation gaps  
- dependency: shared attachment panel integration + OCR expansion  
- estimated size: medium  
- suggested branch name: `feat/accounting-docs-ocr-surface`  
- suggested verification guard: `verify:attachment-surface-accounting` (new)

### Priority 5 — reporting/analytics
1) Operational profitability parity (load/truck/driver) with drill-down traceability  
- reason: closes trucking ERP analytics gaps  
- dependency: posting traceability + reliable dimensional joins  
- estimated size: large  
- suggested branch name: `feat/profitability-drilldown-suite`  
- suggested verification guard: `verify:profitability-report-contracts` (new)

## 13. Risks
- Rebuilding existing systems already working (combobox, profiles, pre-settlements, QBO mirror) causes delivery churn.
- Visual drift risk if implementation work ignores current design authority.
- Fake/mock-only data can mask true integration gaps.
- Placeholder routes in operational modules can be mistaken for shipped functionality.
- Unguarded regressions if new route/data guards are not added.
- Large PRs can bundle unrelated accounting + dispatch + settlement behavior changes.
- Missing/late QBO data projections can be misdiagnosed as frontend failures.

## 14. Final recommendation
Next 3 PRs only (small, testable, CI-guarded):

1) PR-1: accounting route parity hardening  
- scope: wire missing accounting sub-nav destinations to real routes or canonical redirects; remove dead links  
- size: small  
- branch: `feat/accounting-subnav-route-parity`  
- CI guard: `verify:accounting-route-map` (new) + existing `verify:arch-design`

2) PR-2: dedicated expense engine (phase-safe)  
- scope: stop using vendor-bill placeholder path for `/accounting/expenses`; add dedicated expense API + UI path while preserving current UX style  
- size: medium  
- branch: `feat/accounting-expense-engine-phase1`  
- CI guard: `verify:expense-engine-not-bill-backed` (new) + existing `verify:arch-design`

3) PR-3: factoring packet operational route + attachment surface minimum  
- scope: deliver real dispatch factoring packet workspace and minimum document lifecycle visibility (no redesign)  
- size: medium  
- branch: `feat/factoring-packet-ops-surface`  
- CI guard: `verify:factoring-packet-route-not-placeholder` (new) + existing `verify:arch-design`
