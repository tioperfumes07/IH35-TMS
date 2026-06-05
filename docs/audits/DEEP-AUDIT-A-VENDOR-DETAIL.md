# DEEP-AUDIT-A — Vendor Detail Per-Button Walk

**Date:** 2026-06-05 (CST / Laredo) · **Block:** CLOSURE-14-DEEP-AUDIT-A · **Lane:** B  
**Base SHA:** `011e9ad0` · **Method:** Static source walk of `Vendors.tsx` master-detail + `VendorDetail.tsx`  
**Regression guards:** `verify:deep-audit-a-vendor-buttons`

---

## Surfaces audited

| Surface | Route | Component |
|---------|-------|-----------|
| Accounting Vendors master-detail | `/accounting/vendors` | `Vendors.tsx` |
| Full vendor profile | `/vendors/:id` | `VendorDetail.tsx` |

---

## Master-detail (`Vendors.tsx`) — 3 sub-tabs

### Global chrome

| Control | Type | Network on load |
|---------|------|-----------------|
| List / Master-detail toggle | `button` | — |
| Sidebar search/sort/page | inputs | `listVendors`, `listVendorBalances` |
| Edit (header) | `ActionButton` | `navigate(/vendors/:id)` |
| New transaction | `Button` | `navigate(/accounting/bills?vendor_id=…)` |
| VendorsSyncPanel | panel | QBO sync queries |

---

### 1. Transaction List ✅ IMPLEMENTED

Mirrors customer transaction list pattern for bills.

| Control | Type | Behavior |
|---------|------|----------|
| Type filter | select | Only `bill` type |
| Filter popover | status, date, category | `listBills(companyId, { vendor_id, … })` |
| Page size / pagination | select + buttons | Client-side |
| Column chooser | checkboxes | 12 columns; logistics cols show `—` |

**Empty state:** "No transactions for current filters."

**Finding MEDIUM-DA-B-01:** Load #, Settlement #, Truck #, dates, miles columns never populated for bills.

---

### 2. Vendor Details ⚠️ STUB

| On tab open | No extra fetch |
| UI | "Vendor details are shown in the header section for this layout." |
| Buttons | None |

**Finding HIGH-DA-B-02:** Vendor Details tab is informational stub — duplicates header fields without editable workflow.

---

### 3. Notes ✅ PARTIAL

| Behavior | Shows `parseVendorNotes` public notes or "No notes." |
| Edit | None inline — must navigate to `/vendors/:id` Profile |

**Finding MEDIUM-DA-B-03:** Notes tab is read-only; no inline edit on master-detail layout.

---

## Full profile (`VendorDetail.tsx`) — 4 sub-tabs

### Profile tab

| Control | Type | Required | Network |
|---------|------|----------|---------|
| Verify SAFER | `Button` | — | `POST /api/v1/compliance/fmcsa-safer/verify-now` |
| Edit | `Button` | — | Enables `profileEditMode` |
| Cancel | `Button` | — | `setProfileEditMode(false)` — discards unsaved |
| Save | `Button` | name required | `PATCH updateVendor` |
| Save category | `Button` | — | `patchVendorAccountingCategory` (separate from profile save) |
| Lock category | checkbox | — | Included in category patch |

**Profile fields (edit mode):** name*, vendor type, quality rating, telephone, address, primary/secondary contacts, general email, accounting/disputes contacts, factoring % fields (reserves, escrow, late fees, chargebacks, aged invoice rates), notes.

**Finding LOW-DA-B-04:** Category save is always available (not gated on profile Edit mode) — can surprise users.

---

### A/P tab

| Control | Type | Network |
|---------|------|---------|
| Record Bill Payment accordion | toggle | — |
| Payment date, amount, method, reference, memo | inputs | — |
| Auto-match checkbox | checkbox | Client allocation |
| Per-bill checkboxes/amounts (manual mode) | inputs | — |
| Submit payment | `Button` | `recordVendorBillPayment` |
| Open bills list | read-only rows | `listVendorBills` |
| Payment history | table | `listVendorBillPayments` |

**Empty states:** "No open bills." / backend pending banner.

**Finding CRITICAL-DA-B-05:** When `listVendorBillPayments` returns 404/500/501, UI shows amber "Backend pending — file P6-T11204" banner. Bill payment submit may fail silently for some tenants until backend ships.

---

### Documents tab

| Control | RBAC-gated | `DocumentsTab` upload/view |
|---------|------------|---------------------------|

Roles: Owner, Administrator, Manager, Accountant, Mechanic.

---

### Audit History tab

| Control | Read-only integrity history |
|---------|----------------------------|
| Network | `getVendorIntegrityHistory` |

---

## CRITICAL findings

| ID | Finding |
|----|---------|
| DA-B-05 | Vendor bill payment API may 404/500/501 — A/P submit blocked |

## HIGH findings

| ID | Finding |
|----|---------|
| DA-B-02 | Master-detail Vendor Details tab is stub |

## Severity summary (Vendor)

| ID | Severity | Finding |
|----|----------|---------|
| DA-B-05 | **CRITICAL** | Vendor bill payment API may 404/500/501 — A/P submit blocked |
| DA-B-02 | **HIGH** | Master-detail Vendor Details tab is stub |
| DA-B-01 | MEDIUM | Transaction list logistics columns never populated |
| DA-B-03 | MEDIUM | Notes tab read-only on master-detail |
| DA-B-04 | LOW | Category save independent of profile Edit mode |
