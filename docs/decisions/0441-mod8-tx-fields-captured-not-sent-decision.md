# 0441-mod8-tx-fields-captured-not-sent Decision — Banking Transaction Metadata

**Block:** Accounting Block 15 — `0441-mod8-tx-fields-captured-not-sent`  
**Status:** **HOLD** — owner decisions required before schema, API, or UI wiring  
**Classification:** FINANCIAL (tier-2)  
**Source:** MASTER-6 authored dispatch (`0441-mod8-tx-fields-captured-not-sent.txt`)

## Verified Root Cause

Banking Transactions UI captures Check #, Class, Location, Customer/Billable, and Tags in local draft state (`BankingTransactionsDesignView.tsx` draft overlay: `checkNo`, `className`, `location`, `billable`, `tags`), but **none of these values persist or post**:

1. **Schema gap** — `banking.bank_transactions` (migration `0073_p5_t1_1_banking_bank_transactions.sql`) has no columns for `check_number`, `class_name` / `class_id`, `location` / `location_id`, `is_billable`, or `tags`.
2. **API gap** — `categorizeBankTransaction()` payload (lines ~760–776) sends only `category_kind`, `gl_account_id`, vendor/customer/item/driver/unit/trailer/load linkage, recover flags, and `memo`. Captured UI fields are omitted even if columns existed.
3. **Read-back gap** — draft overlay is browser-local; reload loses user-entered metadata with no server round-trip.

**Effect:** Operators see QBO-like fields and believe data is saved; categorize/post succeeds without the captured metadata — silent data loss and broken drill-through.

---

## Owner Decisions Required

Reply on the PR with copy/paste format: `1-B, 2-B, 3-B, 4-B, 5-B` (or your chosen letters).

### 1. Tags

| Option | Model |
|--------|--------|
| **A** | Normalized TMS tags (shared tag vocabulary across modules) |
| **B** | QuickBooks-style normalized Custom Fields (typed definitions + per-txn values) |

**Recommendation: B** — Custom Fields align with QBO parity, support typed validation, and avoid a parallel tag taxonomy that drifts from accounting exports.

### 2. Billable

| Option | Model |
|--------|--------|
| **A** | Metadata-only (`is_billable` boolean + optional customer hint; no downstream workflow) |
| **B** | Customer-required auditable reimbursable expense workflow (billable flag gates customer linkage; spawns traceable reimbursable path with audit) |

**Recommendation: B** — Billable without workflow is a patch; trucking reimbursables need customer linkage, audit, and forward/reverse drill-through to invoices/expenses.

### 3. Class

| Option | Model |
|--------|--------|
| **A** | Independent user selection (manual class picker on each transaction) |
| **B** | Locked unit-derived class (class resolved from tagged `unit_id` → unit's default class; user cannot override on bank txn) |

**Recommendation: B** — Class should follow the unit for P&L segmentation consistency; manual override invites class/unit mismatch and report drift.

### 4. Location

| Option | Model |
|--------|--------|
| **A** | Free text (`location` text column) |
| **B** | Canonical `mdata.locations` UUID FK (`location_id` → `mdata.locations.id`) |

**Recommendation: B** — Free text breaks linkage law; canonical location enables cross-module drill-through (dispatch, fuel, maintenance).

### 5. Check Number

| Option | Model |
|--------|--------|
| **A** | Blanket unique constraint (global or per-company uniqueness on `check_number`) |
| **B** | Nullable bank-document reference without blanket uniqueness (store when present; no UNIQUE index) |

**Recommendation: B** — Check numbers repeat across accounts/vendors and are not stable natural keys; uniqueness would block legitimate entries.

---

## Invariant Requirements (After Decisions)

Regardless of chosen options, implementation **must** satisfy:

1. **Same-entity validation** — every FK (`customer_id`, `unit_id`, `location_id`, class source, etc.) must match `operating_company_id` on the bank transaction; cross-entity links rejected at API + DB.
2. **Explicit set/clear semantics** — PATCH/categorize accepts `null` or dedicated clear flags to remove optional metadata; omitted fields do not silently preserve stale values.
3. **Complete read-back** — GET/list/detail returns all persisted metadata fields; UI draft overlay hydrates from server state after save/reload.
4. **Old/new append-only audit** — every metadata mutation emits `audit.audit_events` with `{ field, old_value, new_value }` (or equivalent structured diff); no silent UPDATE without audit.

---

## Recommendation Summary

| # | Decision | Recommended |
|---|----------|-------------|
| 1 | Tags | **B** — Custom Fields |
| 2 | Billable | **B** — Reimbursable workflow |
| 3 | Class | **B** — Unit-derived |
| 4 | Location | **B** — `mdata.locations` UUID |
| 5 | Check number | **B** — Nullable reference, no blanket UNIQUE |

**Next step after owner sign-off:** unblock `.block-ready/0441-mod8-tx-fields-captured-not-sent.json` for builder dispatch (schema migration + API payload + read-back + guard + live proof).

## Sign-Off

Decision record drafted 2026-07-18. **Awaiting Jorge owner reply on PR before any code dispatch.**
