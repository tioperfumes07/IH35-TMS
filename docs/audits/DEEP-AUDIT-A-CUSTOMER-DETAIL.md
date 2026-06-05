# DEEP-AUDIT-A — Customer Detail Per-Button Walk

**Date:** 2026-06-05 (CST / Laredo) · **Block:** CLOSURE-14-DEEP-AUDIT-A · **Lane:** B  
**Base SHA:** `011e9ad0` (dispatch) · **Method:** Static source walk of `Customers.tsx` master-detail + `CustomerDetail.tsx` full profile  
**Sample entity:** 3 Rivers Logistics Inc. (or any live customer via sidebar selection)  
**Regression guards:** `verify:deep-audit-a-customer-sub-tabs`

---

## Surfaces audited

| Surface | Route | Component |
|---------|-------|-----------|
| Accounting Customers master-detail | `/accounting/customers` | `Customers.tsx` |
| Full customer profile | `/customers/:id` | `CustomerDetail.tsx` |

---

## Master-detail (`Customers.tsx`) — 12 sub-tabs

Sub-tabs rendered via `SecondaryNavTabs` + `CUSTOMER_TABS` constant.

### Global chrome (all tabs)

| Control | Type | Role | Network on load |
|---------|------|------|-----------------|
| List view / Master-detail toggle | `button` | toggle | — |
| + Create Customer | `ActionButton` | opens modal | — |
| Sidebar search | `input` | filter | `GET /api/v1/mdata/customers` (company scoped) |
| Sidebar sort | select | reorder | client-side |
| Sidebar pagination | prev/next | page | client-side slice |
| Edit (header) | `ActionButton` | navigate | `navigate(/customers/:id)` |
| New transaction (header) | `ActionButton` | navigate | `navigate(/accounting/invoices?customer_id=…)` |
| QBO sync panel | panel | sync status | `CustomersSyncPanel` queries |

**On customer select:** `getCustomerBillingSummary(id, companyId)` + `listInvoices(companyId, { customer_id })` for transaction list.

---

### 1. Transaction List ✅ IMPLEMENTED

| Control | Type | Behavior |
|---------|------|----------|
| Type filter | `SelectCombobox` | Client filter on `invoice_type` |
| Filter | `ActionButton` | Toggles filter popover |
| Status / Date / Category (popover) | form fields | Re-fetches `listInvoices` with query params |
| Page size | select | 50/75/100/200/300 client pagination |
| Column chooser ⚙ | `button` | Toggles column visibility checkboxes |
| Previous / Next | `button` | Client-side page |

**Columns (default on):** Date, Type, Doc #, Status, Amount, Balance, Load #  
**Columns (optional):** Settlement #, Truck #, Pick-up date, Delivery date, Loaded miles — **always render `—`** (not wired to load data).

**Empty state:** "No transactions for current filters."  
**Populated state:** Invoice rows from accounting API.

**Finding MEDIUM-DA-A-01:** Optional logistics columns never populated from invoice/load join.

---

### 2–11. Stub tabs (10) ⚠️ PLACEHOLDER ONLY

Tabs: Activity Feed, Statements, Recurring Transactions, Projects, Customer Details, Late Fees, Notes, Tasks, Opportunities, Conversations.

| Behavior | Detail |
|----------|--------|
| On tab click | No additional network request |
| UI | Single panel: "No rows for this tab yet." |
| Buttons | None |
| Forms | None |

**Finding HIGH-DA-A-02:** 10/12 accounting customer sub-tabs are non-functional placeholders — users see tabs that imply QBO-class workflows but deliver empty copy.

---

### 12. COI Requests ✅ IMPLEMENTED

Rendered via `CustomerCOITab` → `listInsuranceCoiRequests`, `createInsuranceCoiRequest`, `updateInsuranceCoiRequest`.

| Control | Type | Network |
|---------|------|---------|
| Status filter | select | Refetch COI list |
| + Request COI | `Button` | Opens modal |
| Request form: policy id, notes, expires | inputs | `POST` create |
| Row Edit / Save / Dismiss | buttons | `PATCH` update |
| Empty state | text | When no requests |

**Finding LOW-DA-A-03:** COI tab disabled when `operatingCompanyId` unset (no inline company picker on this page).

---

## Full profile (`CustomerDetail.tsx`) — 9 sub-tabs

| Tab | Key actions | APIs |
|-----|-------------|------|
| Profile | Edit modal, FMCSA verify, financial chart | `getCustomerDetail`, `getCustomerFinancialSummary`, `updateCustomer` |
| Contacts | Add / edit / deactivate / reactivate | `listCustomerContacts`, CRUD endpoints |
| Billing & Receivables | Record payment, unapply, invoice list | `listCustomerPayments`, `recordCustomerPayment`, `listInvoices` |
| Quality & History | Add/void quality events, lane quality | `listCustomerQualityEvents`, mutations |
| Lanes & Pricing | Add/deactivate lanes | `listCustomerLanes`, lane CRUD |
| Documents | Upload/view (RBAC) | Documents API |
| COI | CoiRequestsTab variant | Insurance COI API |
| Contracts | Placeholder section | — |
| Portal Users | Invite/manage portal users | Portal users API |

**Finding MEDIUM-DA-A-04:** Contracts tab exists in nav but has minimal/placeholder content relative to other tabs.

---

## CRITICAL findings

None identified on customer surfaces in this pass.

## HIGH findings

| ID | Finding |
|----|---------|
| DA-A-02 | 10 master-detail sub-tabs are stub placeholders |

## Severity summary (Customer)

| ID | Severity | Finding |
|----|----------|---------|
| DA-A-02 | **HIGH** | 10 master-detail sub-tabs are stub placeholders |
| DA-A-01 | MEDIUM | Transaction list logistics columns always `—` |
| DA-A-04 | MEDIUM | Contracts sub-tab under-implemented on full profile |
| DA-A-03 | LOW | COI requires pre-selected operating company |

---

## Test data note

No new test customers created for this audit block. Forensic walk used static enumeration; runtime validation against 3 Rivers Logistics Inc. should use existing production/mdata seed data. Flag any CLOSURE-8-style archive if test fixtures are added in a follow-up fix block.
