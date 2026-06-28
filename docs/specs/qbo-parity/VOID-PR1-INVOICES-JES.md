# VOID-EVERYWHERE — PR-1: Invoices + Journal Entries (Design, gated)

**Status:** Design / Docs only. No posting code, no migration. The actual void POSTING (reversing JEs)
is **Tier-1 financial — OUT OF SCOPE here**; this doc designs it, default OFF. BUILD-AND-HOLD; Jorge merges.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Standard cited:** QuickBooks/NetSuite void semantics (void keeps the record, zeroes its effect via a
**reversing entry** dated in an open period; void ≠ delete). Double-entry must balance or fail.
**Scope:** voiding **Invoices** (AR) and **manual Journal Entries**. Bills = PR-2; Expenses/Settlements = PR-3.

---

## 0. Void vs Delete (locked semantics)
- **VOID** keeps the original record (status → `voided`), preserves all fields for audit, and **posts a
  balanced reversing JE** that nets the GL effect to zero. The document number is retained (no gap).
- **DELETE** is NOT offered for posted financial documents (VOID ≠ DELETE — permanent rule). Only
  unposted drafts may be hard-deleted; posted docs are always voided.
- **Credit memo ≠ void:** a credit memo is a *new* document reducing AR for business reasons (return,
  allowance); a void *reverses an error*. They are different flows — do not conflate.

## 1. Reversing-JE shape (Invoice)
Original invoice posts (simplified): `Dr Accounts Receivable / Cr Revenue (+ Cr Sales Tax Payable)`.
**Void reversing JE** (exact mirror, opposite signs):

| Leg | Account | Debit | Credit |
|---|---|---|---|
| 1 | Revenue | original Cr amount | |
| 2 | Sales Tax Payable (if any) | original Cr amount | |
| 3 | Accounts Receivable | | original Dr amount |

- Balanced (Σ Dr = Σ Cr) or **fail hard**.
- Carries `idempotency_key` = `void:invoice:<invoice_id>` (one void per document — re-void is a no-op).
- `entry_date` = **today if the original period is open; else the first day of the current open period**
  (never post into a closed period — §3).
- Links back to the original via `source_transaction_type='invoice_void'`, `source_transaction_id=<invoice_id>`.

## 2. Reversing-JE shape (manual Journal Entry)
Void of a manual JE posts the **inverse of every original line** (swap debit/credit per line, same
accounts/class/entity), same balanced-or-fail rule, `idempotency_key = void:je:<je_id>`, dated per §3.
Original JE status → `voided`; reversing JE references it.

## 3. Period-lock interaction (locked)
- **Cannot void into a closed period.** If the original document's period is closed, the reversing JE is
  dated in the **current open period** (QBO/NetSuite behavior), with a note explaining the date shift.
- Reuse the existing period-close guard; a closed target period **blocks** the post (fail-loud).
- Preview shows the exact reversing JE + its effective date before any post.

## 4. Audit + segregation of duties
- **Mandatory `void_reason`** (free text, required) captured on the document and written to the audit
  event (`audit.row_changes` / audit spine) with who/when/why + the original→voided transition.
- **Maker ≠ checker note:** financial reversals SHOULD require a different user than the original creator
  (segregation of duties). Flag as a policy toggle for Jorge; not enforced in this design doc, but the
  build must support an approver role on void.
- Void emits an audit event class `accounting.invoice.voided` / `accounting.journal_entry.voided`.

## 5. Per-entity scope
All voids are tenant-scoped (`operating_company_id`); TRK/TRANSP/USMCA share nothing. A void never
crosses entities. RLS enforced (`SET app.operating_company_id` before read/write).

## 6. Feature flag (posting GATED OFF)
```
VOID_POSTING_ENABLED  (default OFF)  — gates ALL reversing-JE posting (PR-1/2/3 share it or per-doc).
```
- OFF → the void UI shows the **preview** (reversing JE + date) and **refuses to post** (fail-loud).
- ON → posts the reversing JE atomically, idempotent, period-aware. Flipped only by Jorge + GUARD.

## 7. Acceptance
Void vs delete semantics stated; reversing-JE balanced + period-aware (open-period redating);
idempotency_key defined; mandatory reason + audit event + SoD note; per-entity; posting gated OFF;
credit-memo distinction noted. All posting paths marked **GATED/Tier-1**.

## 8. DO NOT
- DO NOT build the reversing-JE posting without Jorge's explicit OK (Tier-1 financial).
- DO NOT delete posted financial documents (VOID ≠ DELETE).
- DO NOT post into a closed period. DO NOT skip `void_reason` or the audit event.
- DO NOT flip `VOID_POSTING_ENABLED` (D5 — no money flag flips).
