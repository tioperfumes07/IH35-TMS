# 0441-mod8-tx-fields-captured-not-sent Decision — Banking Transaction Metadata

**Block:** Accounting Block 15 — `0441-mod8-tx-fields-captured-not-sent`  
**Status:** **HOLD** — owner decisions required before schema, API, or UI wiring  
**Classification:** FINANCIAL (tier-2)  
**Source:** MASTER-6 authored dispatch (`0441-mod8-tx-fields-captured-not-sent.txt`)

## Verified Root Cause

Banking Transactions UI captures Check #, Class, Location, Customer/Billable, and Tags in local draft state (`BankingTransactionsDesignView.tsx` draft overlay: `checkNo`, `className`, `location`, `billable`, `tags`), but **none of these values persist or post**:

1. **Persistence gap** — `banking.bank_transactions` has no complete persisted representation for the captured Check No/reference, unit-derived Class, driver/operator Location dimension, customer-linked billable direction, or optional Tags shape.
2. **API gap** — `categorizeBankTransaction()` payload (lines ~760–776) sends only `category_kind`, `gl_account_id`, vendor/customer/item/driver/unit/trailer/load linkage, recover flags, and `memo`. Captured UI fields are omitted even if columns existed.
3. **Read-back gap** — draft overlay is browser-local; reload loses user-entered metadata with no server round-trip.

**Effect:** Operators see QBO-like fields and believe data is saved; categorize/post succeeds without the captured metadata — silent data loss and broken drill-through.

---

## Canonical Directives — Decided, Not Questions

This commit **supersedes both prior incorrect framings**: the original five-question framing and the later persistence/source-of-truth question. These directives are canonical and MUST NOT be re-opened in this block:

1. **Class is unit-derived** — resolve the accounting class from the linked unit through the unit-number / unit-linked `catalogs.classes` contract. Do not offer an independent bank-transaction class override.
2. **QBO Location means driver/operator** — per locked decision §7.1 and the QBO-parity system, map the Location dimension through canonical same-entity driver linkage. It is **not** a physical `mdata.locations` FK.
3. **Billable direction is customer-linked** — billable expense lines use customer linkage (`billable_customer_uuid`) and an auditable reimbursable-expense workflow. The build remains a financial **HOLD** and all money-posting/write flags stay **OFF** pending owner/CPA gates.
4. **Retain IH35 trucking Custom Fields** — preserve the existing locked trucking Custom Fields required by the QBO-parity specs; do not delete, replace, or collapse them into arbitrary Tags.
5. **Categorization evidence stays on the bank row** — CHAIN-05 establishes `banking.bank_transactions` as the persisted categorization-evidence source. The accepted expense/expense-line receives the immutable snapshot and linkage required by build design; persistence location is not an owner question.

---

## Owner Decisions Required

Reply on the PR with copy/paste format: `1-B, 2-B` (or your chosen letters).

### 1. Tags Shape

| Option | Contract |
|--------|----------|
| **A** | Add arbitrary normalized bank-transaction Tags alongside the existing locked IH35 trucking Custom Fields. |
| **B** | Use only the existing locked Custom Fields framework; do not add arbitrary Tags. |

**Recommendation: B unless the owner needs ad-hoc tags** — one governed Custom Fields framework avoids overlapping taxonomies while preserving every locked trucking field.

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

1. **Entity-scoped links** — every FK (`customer_id`, `unit_id`, driver/operator Location linkage, class source, expense linkage, etc.) must match `operating_company_id`; cross-entity links are rejected at API + DB.
2. **Explicit set/clear semantics** — PATCH/categorize accepts `null` or dedicated clear flags to remove optional metadata; omitted fields do not silently preserve stale values.
3. **Full read-back** — GET/list/detail returns all persisted metadata fields; UI state hydrates from server state after save/reload.
4. **Append-only old/new audit** — every metadata mutation emits an append-only audit record with `{ field, old_value, new_value }` (or equivalent structured diff); no silent UPDATE without audit.
5. **No QBO write-back** — TMS and QBO remain parallel books; this workflow must not enqueue or perform TMS→QBO writes.
6. **Financial HOLD / flags OFF** — no posting flag is enabled and no financial implementation merges without the required owner/CPA ceremony and proof.

---

## Recommendation Summary

| # | Decision | Recommended |
|---|----------|-------------|
| 1 | Tags shape | **B** — existing locked Custom Fields only |
| 2 | Imported check/reference | **B** — normalized nullable reference + warning, no hard UNIQUE |

**Next step after owner sign-off:** unblock `.block-ready/0441-mod8-tx-fields-captured-not-sent.json` for builder dispatch (schema migration + API payload + read-back + guard + live proof).

## Sign-Off

Decision record corrected again 2026-07-18. This commit visibly supersedes both the prior five-question framing and the later persistence-question framing. **Awaiting Jorge owner reply on PR before any code dispatch.**
