# VOID-EVERYWHERE — PR-3: Expenses + Settlements (Design, gated)

**Status:** Design / Docs only. No posting code, no migration. Void POSTING is **Tier-1 financial —
OUT OF SCOPE**; designed here, default OFF. BUILD-AND-HOLD; Jorge merges.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Standard cited:** QuickBooks/NetSuite void semantics. Companion to PR-1 (Invoices/JEs) + PR-2 (Bills).
**Scope:** voiding **Expenses** (direct cash/card spend) and **driver Settlements** (the TMS-specific
payable). Settlements are the highest-risk void (driver pay) — treat with extra guards.

---

## 0. Void vs Delete (same locked semantics)
VOID keeps the record (status → `voided`), reverses the GL, retains the number, requires a reason.
DELETE not offered for posted expenses/settlements.

## 1. Reversing-JE shape (Expense)
Original expense posts: `Dr Expense (+ Dr Tax) / Cr Cash|Bank|Credit Card`.
**Void reversing JE:** `Dr Cash|Bank|Credit Card / Cr Expense (+ Cr Tax)` — exact mirror, balanced or
fail. `idempotency_key = void:expense:<expense_id>`. Dated per period rule (§3). Reverses FH-7
unit-allocation tags alongside (dimension, not a separate JE).

## 2. Reversing-JE shape (Settlement) — highest risk
A settlement aggregates driver earnings − deductions → net pay. Original posts (simplified):
`Dr Settlement/Driver-Pay Expense · Dr/Cr deduction & reimbursement lines / Cr Cash|AP-to-driver`.
**Void reversing JE** mirrors every line (swap Dr/Cr), balanced or fail.
`idempotency_key = void:settlement:<settlement_id>`. Dated per §3.

**Settlement-specific guards (locked):**
- **Cannot void a PAID settlement** without first voiding the payment/disbursement (mirror the AP
  paid-bill ordering, PR-2 §2). Blocked with "void the disbursement first".
- **Cash-advance / escrow / deduction recovery interactions:** if the settlement consumed advances or
  escrow, voiding must **restore** those balances (the advance returns to outstanding; escrow
  re-credits). Preview must show every restored balance. This is the riskiest path — design requires a
  GUARD walkthrough before build.
- **Linked loads/trips:** voiding a settlement re-opens the loads it settled (they return to
  "unsettled") so they can be re-settled correctly. No orphaned settled-but-unpaid loads.

## 3. Period-lock interaction
Cannot void into a closed period; reversing JE dates into the current open period if the original is
closed (note the shift). Reuse the period-close guard; closed target blocks the post.

## 4. Audit + SoD (elevated for settlements)
- Mandatory `void_reason`. Audit events `accounting.expense.voided` / `settlement.voided` (+
  `settlement.disbursement.voided`) with who/when/why + balance restorations logged to
  `audit.row_changes`/spine.
- **Maker ≠ checker REQUIRED (recommended hard) on settlement voids** — driver-pay reversals are
  embezzlement-sensitive; the approver role must differ from the voider. Flag for Jorge to set as
  enforced.

## 5. Per-entity scope
Tenant-scoped (`operating_company_id`); settlements live on the operating entity (TRANSP); never cross
entities; RLS enforced.

## 6. Feature flag (posting GATED OFF)
Shares `VOID_POSTING_ENABLED` (default OFF). OFF → preview + refuse-to-post (fail-loud). ON → atomic,
idempotent, period-aware. Settlement voids may warrant a **separate** sub-flag
(`VOID_SETTLEMENT_POSTING_ENABLED`, default OFF) given the risk — recommend to Jorge.

## 7. Acceptance
Void vs delete; reversing-JE balanced + period-aware for expense & settlement; paid-first ordering;
advance/escrow/load restorations specified; idempotency_key; mandatory reason + elevated audit + SoD;
per-entity; posting gated OFF (with optional settlement sub-flag).

## 8. DO NOT
- DO NOT void a paid settlement/expense without voiding the disbursement/payment first.
- DO NOT void a settlement without restoring consumed advances/escrow and re-opening its loads.
- DO NOT delete posted records (VOID ≠ DELETE). DO NOT post into a closed period.
- DO NOT skip `void_reason`/audit. DO NOT flip the void flags (D5). DO NOT build posting without Jorge's OK.
