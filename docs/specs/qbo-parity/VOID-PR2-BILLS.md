# VOID-EVERYWHERE — PR-2: Bills (AP) (Design, gated)

**Status:** Design / Docs only. No posting code, no migration. Void POSTING is **Tier-1 financial —
OUT OF SCOPE**; designed here, default OFF. BUILD-AND-HOLD; Jorge merges.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Standard cited:** QuickBooks/NetSuite void semantics (void keeps record, reverses GL, dated in an open
period; void ≠ delete). Companion to PR-1 (Invoices/JEs) and PR-3 (Expenses/Settlements).
**Scope:** voiding **Bills** (Accounts Payable) and the bill→payment relationship.

---

## 0. Void vs Delete (same locked semantics as PR-1)
- VOID keeps the bill (status → `voided`), preserves fields, posts a balanced reversing JE, retains the
  bill number. DELETE not offered for posted bills. Vendor credit ≠ void (a vendor credit is a new
  document; a void reverses an error).

## 1. Reversing-JE shape (Bill)
Original bill posts (simplified): `Dr Expense/Asset (+ Dr Tax) / Cr Accounts Payable`.
**Void reversing JE:**

| Leg | Account | Debit | Credit |
|---|---|---|---|
| 1 | Accounts Payable | original Cr amount | |
| 2 | Expense / Asset | | original Dr amount |
| 3 | Tax (if any) | | original Dr amount |

- Balanced or fail hard. `idempotency_key = void:bill:<bill_id>`. Dated per period rule (§3).
- Reverses any **FH-7 unit-allocation** sub-ledger tags attached to the bill (the allocation rows are
  marked voided alongside — they are a dimension, not a separate JE; no double-reversal).

## 2. Paid / partially-paid bills (the AP wrinkle — locked)
- **A bill with an applied bill-payment CANNOT be voided directly.** The payment must be voided/unapplied
  first (the payment void is its own reversing entry — Dr Cash / Cr AP). QBO/NetSuite enforce this
  ordering; mirror it: voiding a paid bill is **blocked** with a message "void the payment(s) first".
- Once unpaid, the bill void proceeds per §1.
- Preview shows the dependency chain (which payments block the void).

## 3. Period-lock interaction
- Cannot void into a closed period; reversing JE dates into the current open period if the original
  period is closed (note the date shift). Reuse the period-close guard; closed target blocks the post.

## 4. Audit + SoD
- Mandatory `void_reason`; audit event `accounting.bill.voided` (+ `accounting.bill_payment.voided` for
  payment voids) with who/when/why + original→voided transition written to `audit.row_changes`/spine.
- Maker ≠ checker note: approver role recommended on AP voids (segregation of duties).

## 5. Per-entity scope
Tenant-scoped (`operating_company_id`); TRK/TRANSP/USMCA share nothing; RLS enforced. AP voids never
cross entities (intercompany bills are voided on each entity's own books).

## 6. Feature flag (posting GATED OFF)
Shares `VOID_POSTING_ENABLED` (default OFF) with PR-1/PR-3. OFF → preview + refuse-to-post (fail-loud).
ON → atomic, idempotent, period-aware posting. Flipped only by Jorge + GUARD.

## 7. Acceptance
Void vs delete; reversing-JE balanced + period-aware; paid-bill ordering (void payment first); FH-7
allocation reversal; idempotency_key; mandatory reason + audit + SoD; per-entity; posting gated OFF.

## 8. DO NOT
- DO NOT void a paid bill without first voiding/unapplying its payment(s).
- DO NOT delete posted bills (VOID ≠ DELETE). DO NOT post into a closed period.
- DO NOT skip `void_reason`/audit. DO NOT flip `VOID_POSTING_ENABLED` (D5).
- DO NOT build the posting without Jorge's explicit OK (Tier-1 financial).
