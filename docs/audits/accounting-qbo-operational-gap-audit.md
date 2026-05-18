# Accounting QBO Operational Gap Audit

Date: 2026-05-18  
Branch baseline audited: `main` (HEAD `0e3062a`)

## Scope and Method

- This audit is code-verified against current frontend/backend routes, pages, and components.
- For each requested area:
  - `A)` WHAT ALREADY EXISTS today (actual routes/pages/components).
  - `B)` WHAT IS GENUINELY MISSING (with rough dependency + rough size).
- Recently shipped items from PRs #117-#123 are marked `DONE` where present.

---

## 1) Accounting pages and sub-nav (real vs ComingSoon)

`A) WHAT ALREADY EXISTS`

- `DONE`: Real accounting routes in `apps/frontend/src/App.tsx`:
  - `/accounting/invoices`, `/accounting/invoices/:id`
  - `/accounting/payments`, `/accounting/payments/:id`
  - `/accounting/factoring`, `/accounting/factoring/:id`
  - `/accounting/pre-settlements`
  - `/accounting/bills`, `/accounting/bills/vendor`, `/accounting/expenses`
  - `/accounting/vendor-balances`, `/accounting/journal-entries`, `/accounting/bill-payments`
- `DONE`: Accounting sub-nav exists in `apps/frontend/src/pages/accounting/AccountingSubNav.tsx` and is mounted in key pages (`InvoicesListPage`, `PaymentsListPage`, `FactoringListPage`, `BillPaymentsListPage`, `ManualJEListPage`, `AccountingPreSettlementsPage`).
- `/accounting` redirects to `/accounting/invoices`.

`B) WHAT IS GENUINELY MISSING`

- Sub-nav links exist for `/accounting/maintenance-shop`, `/accounting/vendors`, `/accounting/customers`, `/accounting/reports`, but these routes are not registered in `App.tsx`; navigation goes to fallback flow instead of dedicated pages.
  - Dependency: frontend route registration + target page components.
  - Size: `small` for route wiring to existing pages, `medium` if new dedicated pages are required.

---

## 2) Vendors / Customers / Bills / Expenses / Invoices

`A) WHAT ALREADY EXISTS`

- `DONE`: Vendors list and profile:
  - `/vendors` (`VendorsPage`) has transaction list tab, filters, column chooser, pagination.
  - `/vendors/:id` (`VendorDetailPage`) has editable profile, quality rating, A/P tab, bill payment UX, documents tab.
- `DONE`: Customers list and profile:
  - `/customers` (`CustomersPage`) has transaction list tab, filters, column chooser, pagination.
  - `/customers/:id` (`CustomerDetailPage`) has editable profile, billing/receivables, quality/history, documents/contracts tabs.
- Bills:
  - `/accounting/bills` (`BillsPage`) with status filter and partial-payment expansion.
  - `/accounting/bills/vendor` (`VendorBillCreatePage`) uses `QboCombobox` for vendor/item/account assists.
- Expenses:
  - `/accounting/expenses` (`ExpenseCreatePage`) exists.
- Invoices:
  - `/accounting/invoices` (`InvoicesListPage`) and `/accounting/invoices/:id` (`InvoiceDetailPage`) with line edits, send/void, factoring linkage.

`B) WHAT IS GENUINELY MISSING`

- Expense flow is still a bill-backed placeholder (`ExpenseCreatePage` posts via `createVendorBill` and labels itself as phase placeholder), not a dedicated expense engine with expense-specific posting/matching.
  - Dependency: backend dedicated expense endpoints + posting rules + UI migration.
  - Size: `medium`.
- Vendor and customer “extra tabs” in list pages (activity feed, statements, projects, tasks, opportunities, conversations, etc.) are mostly placeholder text rather than full workflows.
  - Dependency: backend domain services per tab + list/detail UI.
  - Size: `large`.

---

## 3) Bill Payments, Vendor Balances, Journal Entries

`A) WHAT ALREADY EXISTS`

- `/accounting/bill-payments` (`BillPaymentsListPage`) supports filtering, search, record payment modal, owner-only void.
- `/accounting/vendor-balances` (`VendorBalancesPage`) supports vendor balance buckets, bill drilldown, payment history, payment modal.
- `/accounting/journal-entries` (`ManualJEListPage`) supports filters, create manual JE (`ManualJEModal`), owner voids.

`B) WHAT IS GENUINELY MISSING`

- No true JE detail page with immutable posting ledger trail and line-level revision history from UI.
  - Dependency: backend JE detail/audit endpoint + detail page.
  - Size: `medium`.
- No explicit batch bill-payments import/reconciliation workflow (bank batch match or lock-step disbursement cycle).
  - Dependency: payment batch model + reconciliation services.
  - Size: `medium`.

---

## 4) Driver Escrow, Pre-settlements, Driver Settlements, Factoring Packets

`A) WHAT ALREADY EXISTS`

- `DONE`: Pre-settlements pages:
  - `/accounting/pre-settlements` (`AccountingPreSettlementsPage`)
  - dispatch tab integration in `/dispatch` (`PreSettlementsPanel`).
- Driver settlements:
  - `/driver-finance/settlements` (`SettlementsPage`) list/KPI/pipeline tabs.
  - `SettlementDetailPage` includes debt banner, deductions, escrow visualizer, pending ack, disputes, payment-state transitions, PDF link.
- Driver escrow:
  - Banking tab `driver_escrow` via `DriverEscrowTabContent` with account-level and driver-level timeline.
- Backend depth:
  - `driver-finance` routes/services for settlements, debt, deductions, payment events, disputes.

`B) WHAT IS GENUINELY MISSING`

- `/dispatch/factoring-packets` route is explicitly wired to `ComingSoonPage` in `App.tsx`; no dedicated factoring packet operational page in dispatch module.
  - Dependency: frontend factoring-packet queue page + backend packet assembly/status APIs.
  - Size: `medium`.
- Pre-settlement link from load creation is deferred in backend (`dispatch/book-load.service.ts` TODO comment for open presettlement lookup/link).
  - Dependency: pre-settlement query/link service.
  - Size: `small`.

---

## 5) Fuel Planner / Settings / Inbox, Dispatch Loads, Geofencing, Incidents, Lists/Catalogs dynamic pages, Driver Communication Log, Banking Reports

`A) WHAT ALREADY EXISTS`

- Fuel:
  - `/fuel` (`FuelPlannerHomePage`) with tabs (home/planner/inbox/settings/etc), KPI, active route, stop logic, savings/compliance, Loves upload modal.
- Dispatch loads:
  - `/dispatch` (`DispatchPage`) supports kanban/list, filters, paging, load drawer, book-load modal, pre-settlement tab.
- Lists/Catalogs:
  - `/lists` hub (`ListsHubPage`) + many concrete routes for dispatch/driver/fleet/fuel/maintenance/accounting/safety lists.
  - `DONE`: responsive table/list work present in major list pages and tables.
- Banking reports:
  - Banking tab “Reports” implemented by `BankingReportsTabContent` linking to existing reports module.

`B) WHAT IS GENUINELY MISSING`

- `/fuel/planner`, `/fuel/settings`, `/fuel/inbox` are currently routed to `ComingSoonPage` in `App.tsx`; only `/fuel` is real.
  - Dependency: route split or alias wiring to real sub-views.
  - Size: `small` to `medium`.
- `/dispatch/geofencing` and `/dispatch/incidents` are routed to `ComingSoonPage`.
  - Dependency: geofence/incidents pages + backing APIs.
  - Size: `medium`.
- Dynamic fallback routes `/lists/:domain` and `/lists/:domain/:catalogKey` still resolve to `ComingSoonPage`; only explicitly mapped catalogs are real.
  - Dependency: generic catalog renderer + registry-driven forms.
  - Size: `medium`.
- Driver Communication Log page/route is not present (no frontend route/page found for this module).
  - Dependency: comm-log storage/retrieval + UI timeline.
  - Size: `medium`.

---

## 6) Combobox coverage (searchable vs plain select)

`A) WHAT ALREADY EXISTS`

- `DONE`: Universal combobox base exists:
  - `components/Combobox.tsx` (contains/startsWith/fuzzy filtering, keyboard nav, add-new option).
  - wrappers `components/shared/Combobox.tsx` and `components/shared/SelectCombobox.tsx`.
- `DONE`: QBO-aware searchable combobox exists (`components/forms/QboCombobox.tsx`) and is used in accounting creation forms.
- Broad adoption: many pages now use `SelectCombobox` in filters/forms.

`B) WHAT IS GENUINELY MISSING`

- Mixed pattern remains: some screens still use plain `<input>` or prompt-based edits where searchable combobox candidates exist (especially detail modal edit flows and UUID-driven fields).
  - Dependency: page-by-page control normalization.
  - Size: `small` per screen, `large` across full app.
- No single-source combobox consolidation yet (explicit TODO states 3-file split pending follow-up).
  - Dependency: UI refactor only.
  - Size: `small`.

---

## 7) Attachment support per module

`A) WHAT ALREADY EXISTS`

- `DONE`: Shared documents system is production-grade:
  - `DocumentsTab`, `UploadModal`, preview/edit/version/soft-delete/restore.
  - Backend docs endpoints + R2 presigned upload/download flow.
- `DONE`: Customer and vendor detail pages mount `DocumentsTab`; customer contracts tab also uses documents.
- Backend `attachments` API supports entity types:
  - `load`, `bill`, `expense`, `invoice`, `payment`, `journal_entry`, `driver`, `customer`, `vendor`, etc.

`B) WHAT IS GENUINELY MISSING`

- Most accounting module pages (invoice detail, bills page, expenses page, payments page, JE page) do not expose embedded attachment panels despite backend capability.
  - Dependency: attach documents UI blocks to those pages + category defaults.
  - Size: `medium`.
- OCR currently exposed for rate confirmation parse route only; not generalized into accounting/banking attachment workflows.
  - Dependency: OCR pipeline expansion + module integration.
  - Size: `medium`.

---

## 8) Operational linkage (Load→Invoice→AR, Load→Driver Bill→Settlement, Maintenance→Bill, Fuel→Expense)

`A) WHAT ALREADY EXISTS`

- `Load -> Invoice -> AR`: implemented.
  - Backend `accounting/from-load.ts` builds invoice + line idempotently from load.
  - Invoice list/detail and payments/applications pages exist.
- `Load -> Driver Bill -> Settlement`: implemented in core flow.
  - Backend `dispatch/book-load.service.ts` auto-creates driver bill artifacts and enqueues settlement/factoring/invoice/fuel planner outbox events.
  - Driver bills retrieval route exists (`driver-finance/driver-bills`).
  - Settlement UI and APIs are active.
- `Maintenance -> Bill/Expense`: implemented.
  - `maintenance/work-orders.routes.ts` auto-creates bill or expense based on payment timing.

`B) WHAT IS GENUINELY MISSING`

- `Fuel -> Expense`: no dedicated fuel-to-accounting expense posting engine found; fuel planner exists but accounting expense posting remains placeholder/manual.
  - Dependency: fuel transaction posting rules + accounting expense integration.
  - Size: `large`.
- Dispatch factoring packet lifecycle is queued/outbox-oriented but user-facing packet ops page is missing (see section 4/5).
  - Dependency: packet UI + processing status APIs.
  - Size: `medium`.

---

## 9) Settlement deduction / escrow / driver-debt layer

`A) WHAT ALREADY EXISTS`

- `DONE`: Settlement deduction and debt layer is active:
  - Backend debt route (`driver-finance/drivers/:id/debt-summary`) using recompute function.
  - Settlement detail renders debt banner, pending-ack totals, liabilities modal, held deduction controls.
- `DONE`: Escrow integration exists:
  - Banking escrow tab + backend escrow ledger/register paths.
- Payment-state transitions (queued/sent/cleared/bounced/manual paid) exist in settlement detail.

`B) WHAT IS GENUINELY MISSING`

- End-to-end accounting journal visibility for every settlement deduction/escrow mutation is not exposed as a dedicated traceable ledger view in UI.
  - Dependency: posting-trace endpoint + UI ledger trace panel.
  - Size: `medium`.
- Driver-facing communication timeline tied to debt/escrow events (notifications + acknowledgments in one audit stream) is fragmented across modules.
  - Dependency: consolidated event store and timeline UI.
  - Size: `medium`.

---

## 10) Recently built items check (PRs #117-#123)

- `DONE`: Universal combobox foundation present (`Combobox`, `SelectCombobox`, `QboCombobox`) and broadly adopted.
- `DONE`: Vendor/customer editable profiles + transaction list views + pagination present (`Vendors`, `Customers`, `VendorDetail`, `CustomerDetail`).
- `DONE`: Factoring company profile editing present (`FactoringHomePage` active factor profile edit).
- `DONE`: Customer/vendor quality ratings present in list/detail pages and quality event tooling.
- `DONE`: Pre-settlements pages present in accounting and dispatch.
- `DONE`: Responsive data tables/list updates are present in major list screens/components.
- `DONE`: QBO master-data projection migrations present in `db/migrations/0193_qbo_master_data_projection_links.sql` and `db/migrations/0194_qbo_master_data_projection_transp.sql`.

---

## Bottom Line

- The repo now has substantial operational-accounting depth across invoices/payments/bills/vendor balances/journal entries/settlements/debt/escrow and QBO master-data projection.
- Primary gaps are no longer foundational; they are concentrated in:
  - missing routed pages still pointed to coming-soon,
  - incomplete module wiring (fuel->expense, factoring packet UI),
  - and uneven attachment/traceability surfaces across accounting detail pages.
