# Accounting Stubs Audit

Scope: read-only audit of three App routes currently mapped to `ComingSoonPage`.

## Common route mapping in `App.tsx`

The three accounting paths are defined inside one mapped route block:

- `"/accounting/bill-payments"`
- `"/accounting/vendor-balances"`
- `"/accounting/journal-entries"`

Each is rendered by:

- `<ProtectedRoute><ComingSoonPage /></ProtectedRoute>`

via the `.map((path) => <Route key={path} path={path} ... />)` block in `apps/frontend/src/App.tsx`.

---

## 1) `/accounting/bill-payments`

### Exact route entry and target
- Route path entry exists in the shared `path[]` list in `apps/frontend/src/App.tsx`: `"/accounting/bill-payments"`.
- Component target is `ComingSoonPage` through the mapped `<Route ... element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />`.

### Existing related functionality already in codebase
- `BillPaymentForm` exists at `apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx`.
- `ApplyToBillForm` exists at `apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx`.
- Both are used by `apps/frontend/src/pages/banking/components/CategorizeDrawer.tsx`.
- Single-bill pay flow exists in accounting:
  - UI: `apps/frontend/src/pages/accounting/PayBillModal.tsx` calls `payVendorBill(...)`.
  - UI host: `apps/frontend/src/pages/accounting/VendorBalancesPage.tsx` (component exists, but its route is currently a stub).
- Vendor A/P pay flow exists and is currently routed:
  - UI: `apps/frontend/src/pages/VendorDetail.tsx` (A/P tab) calls `recordVendorBillPayment(...)`.
  - Route exists: `/vendors/:id` in `apps/frontend/src/App.tsx`.
- Bills list shows payment history today:
  - UI: `apps/frontend/src/pages/accounting/BillsPage.tsx` uses `listPaymentsForBill(...)`.

### Backend endpoints/data already existing
- `GET /api/v1/accounting/bill-payments`
  - Returns per-record payment rows (`id`, `bill_id`, `vendor_id`, `payment_date`, `amount_cents`, method/reference/memo, etc.).
- `POST /api/v1/accounting/bills/:id/pay`
  - Creates a bill payment against a single bill.
- `GET /api/v1/accounting/bills/:id/payments`
  - Returns per-bill payment detail rows.
- `POST /api/v1/accounting/bill-payments/:id/void`
  - Voids an existing bill payment.
- `POST /api/v1/vendors/:id/bill-payments`
  - Records vendor-level payment batches with bill applications.
- `GET /api/v1/vendors/:id/bill-payments`
  - Returns grouped bill-payment rows and `total`.

### SURFACE vs BUILD
- **SURFACE** (bill-payment backend/service exists; routed and unrouted UI flows already exist; missing piece is dedicated `/accounting/bill-payments` page wiring).

---

## 2) `/accounting/vendor-balances`

### Exact route entry and target
- Route path entry exists in the shared `path[]` list in `apps/frontend/src/App.tsx`: `"/accounting/vendor-balances"`.
- Component target is `ComingSoonPage` through the same mapped route block.

### Existing related functionality already in codebase
- Full vendor balances page component exists:
  - `apps/frontend/src/pages/accounting/VendorBalancesPage.tsx`
  - Uses `listVendorBalances`, `listVendorBills`, `getVendorBill`, `voidVendorBillPayment`, and `PayBillModal`.
- Banking home already shows a vendor-balance summary card and links to `/accounting/vendor-balances`:
  - `apps/frontend/src/pages/banking/BankingHome.tsx`.
- A/P aging report page exists and is routed:
  - Route `/reports/ap-aging` in `apps/frontend/src/App.tsx`.
  - UI `apps/frontend/src/pages/reports/APAgingPage.tsx`.

### Backend endpoints/data already existing
- `GET /api/v1/accounting/vendor-balances`
  - Returns per-vendor rows: `vendor_id`, `vendor_name`, `balance_cents`, `open_bill_count`, `next_due_date`, `last_bill_date`.
- `GET /api/v1/accounting/bills?vendor_id=...`
  - Returns per-bill detail (`bill_number`, `bill_date`, `due_date`, `amount_cents`, `paid_cents`, `status`, `balance_cents`).
- `GET /api/v1/accounting/bills/:id`
  - Returns bill detail + payment history + related audit events.
- `GET /api/v1/reports/ap-aging`
  - Returns totals and per-vendor aging buckets (`totals.total_outstanding_cents`, bucket totals, per-vendor `bill_count`, `last_payment_date`).

### SURFACE vs BUILD
- **SURFACE** (vendor-balance and A/P data + UI components already exist; stub route is not wired to existing page).

---

## 3) `/accounting/journal-entries`

### Exact route entry and target
- Route path entry exists in the shared `path[]` list in `apps/frontend/src/App.tsx`: `"/accounting/journal-entries"`.
- Component target is `ComingSoonPage` through the same mapped route block.

### Existing related functionality already in codebase
- `ManualJEModal` exists and is wired:
  - Component: `apps/frontend/src/pages/banking/components/ManualJEModal.tsx`.
  - Re-export for accounting namespace: `apps/frontend/src/pages/accounting/ManualJEModal.tsx`.
  - Live usage in routed page: `apps/frontend/src/pages/banking/BankingHome.tsx` (`+ Manual JE` action opens modal).
- `ManualJEForm` exists:
  - `apps/frontend/src/pages/banking/components/forms/ManualJEForm.tsx` (used in `CategorizeDrawer`).
- Existing list page component exists:
  - `apps/frontend/src/pages/accounting/ManualJEListPage.tsx` (lists/filter/void journal entries), but no route currently points to it.

### Backend endpoints/data already existing
- `POST /api/v1/accounting/journal-entries`
  - Creates journal entries (balanced debit/credit validation; source/manual supported).
- `GET /api/v1/accounting/journal-entries`
  - Returns per-entry list with `debit_total_cents` and `credit_total_cents`.
- `GET /api/v1/accounting/journal-entries/:id`
  - Returns header plus per-posting detail lines (`account`, `class`, debit/credit, amount, description).
- `POST /api/v1/accounting/journal-entries/:id/void`
  - Voids journal entry (owner-only guard in service).
- Supporting selector endpoints used by modal:
  - `GET /api/v1/catalogs/accounts`
  - `GET /api/v1/catalogs/classes`

### SURFACE vs BUILD
- **SURFACE** (journal-entry create/list/detail/void backend exists, plus UI modal and list component exist; `/accounting/journal-entries` route is still stubbed).
