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

## Canonical Directives — Decided, Not Questions

The prior five-question framing is **superseded**. These four directives are already canonical and MUST NOT be re-opened in this block:

1. **Class is unit-derived** — resolve the accounting class from the linked unit through the unit-number / unit-linked `catalogs.classes` contract. Do not offer an independent bank-transaction class override.
2. **Location is canonical** — link by same-entity `mdata.locations` UUID FK; do not store free-text location as the canonical value.
3. **Billable is customer-linked workflow** — billable expense lines use customer linkage (`billable_customer_uuid`) and an auditable reimbursable-expense workflow; a metadata-only boolean is insufficient.
4. **Retain IH35 trucking custom fields** — preserve the existing trucking custom fields required by the QBO-parity specs; do not replace or delete them in favor of a generic tag-only model.

---

## Owner Decisions Required

Reply on the PR with copy/paste format: `1-C, 2-B` (or your chosen letters).

### 1. Persistence / Source of Truth

| Option | Contract |
|--------|----------|
| **A** | Bank transaction only — metadata persists only on `banking.bank_transactions`. |
| **B** | Resulting accounting record only — metadata persists only on the accepted `accounting.expenses` / `accounting.expense_lines` record. |
| **C** | Bank transaction as source evidence plus an immutable snapshot/copy on the resulting accepted expense / expense line. |

**Recommendation: C** — preserve imported source evidence while freezing the accepted accounting interpretation for audit, read-back, and forward/reverse drill-through.

### 2. Imported Check / Reference Semantics

| Option | Contract |
|--------|----------|
| **A** | Verbatim nullable text with no duplicate signal. |
| **B** | Normalized nullable reference with an account-scoped, fiscal-year duplicate **warning**, but no hard uniqueness constraint. |
| **C** | Hard unique per bank account and fiscal year. |

**Recommendation: B** — imported references are useful duplicate-risk signals but are not reliable natural keys. The blueprint's hard uniqueness rule applies to posted `accounting.bill_payments`, not automatically to imported `banking.bank_transactions`.

---

## Invariant Requirements (After Decisions)

Regardless of chosen options, implementation **must** satisfy:

1. **Entity-scoped links** — every FK (`customer_id`, `unit_id`, `location_id`, class source, expense linkage, etc.) must match `operating_company_id`; cross-entity links are rejected at API + DB.
2. **Explicit set/clear semantics** — PATCH/categorize accepts `null` or dedicated clear flags to remove optional metadata; omitted fields do not silently preserve stale values.
3. **Full read-back** — GET/list/detail returns all persisted metadata fields; UI state hydrates from server state after save/reload.
4. **Append-only old/new audit** — every metadata mutation emits an append-only audit record with `{ field, old_value, new_value }` (or equivalent structured diff); no silent UPDATE without audit.
5. **No QBO write-back** — TMS and QBO remain parallel books; this workflow must not enqueue or perform TMS→QBO writes.

---

## Recommendation Summary

| # | Decision | Recommended |
|---|----------|-------------|
| 1 | Persistence / source of truth | **C** — source evidence + immutable accepted snapshot |
| 2 | Imported check/reference | **B** — normalized nullable reference + warning, no hard UNIQUE |

**Next step after owner sign-off:** unblock `.block-ready/0441-mod8-tx-fields-captured-not-sent.json` for builder dispatch (schema migration + API payload + read-back + guard + live proof).

## Sign-Off

Decision record corrected 2026-07-18. The prior five-question framing is visibly superseded above. **Awaiting Jorge owner reply on PR before any code dispatch.**
