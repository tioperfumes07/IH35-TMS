# DESIGN (build-and-HOLD) — Bank-feed line categorized `transfer` has no GL / no JE

- **Block:** `0285-banking-transfer-gl-gap` (a.k.a. `0285-banking-transfer-gl-gap_VERIFY`)
- **Module:** banking · **Pile:** GAP (AUDIT-NOTE) · **Classification:** FINANCIAL CLUSTER (GL posting)
- **Status:** DESIGN ONLY. **No money code in this PR.** This document is the plan; any code that posts a
  transfer JE from the bank-feed categorize path ships in a **separate owner-gated PR** after `JORGE-APPROVED`
  and a per-entity Neon tie-out.
- **Branch:** `design/0285-banking-transfer-gl-hold` (pinned to `origin/main` @ `e2db37a74`)
- **CPA posture (loaded `ih35-cpa-accounting-decisions`):** **reuse the existing poster, write NO new GL math**;
  all money-posting flags stay **default OFF**, per-entity override only; an agent never posts/moves money —
  the flip is the owner's hand.
- **Rule 13 (financial cluster → build-and-HOLD):** never self-merge; HOLD for owner even when a future fix is
  small, because it changes what does/doesn't hit `accounting.journal_entries`.

---

## 1. Problem statement (verified on `origin/main` @ `e2db37a74`, not memory)

The original audit note reads:

> OPEN: `banking.bank_transactions` transfer `category_kind='transfer'` has **zero GL-posting call path**
> (not even flag-gated) — inter-account bank transfers never get an `accounting.journal_entries` linkage
> regardless of `BANK_FEED_GL_PO…`.

That note is **half true**, and the precise truth matters for the fix. There are **two distinct transfer
surfaces**, and only one of them posts:

| Surface | Path | Posts a JE? | Evidence (`origin/main` @ `e2db37a74`) |
|---|---|---|---|
| **A. Explicit "Record Transfer"** | `banking.transfers` via `createTransfer()` | ✅ YES (flag-gated) | `apps/backend/src/banking/transfers.service.ts` — `createTransfer` → `maybePostTransferGl` → `postSourceTransaction({ source_transaction_type: "transfer", … })`; gated by per-entity `TRANSFER_GL_POSTING_ENABLED` (default OFF, migration `202607150000`). `revokeTransfer` reverses via `reversePostedSourceTransaction`. |
| **B. Bank-**feed** line categorized as a transfer** | `banking.bank_transactions` → categorize | ❌ NO — **explicitly skipped** | `apps/backend/src/banking/bank-feed-gl-posting.service.ts` L165–170: if `transfer_kind \|\| destination_bank_account_id \|\| review_state === "transfer" \|\| matched_transfer_id` → `return { ok: false, reason: "is_transfer" }`. |

**So the real gap is narrower and by-design-collides:**

- Surface B **intentionally** skips posting to avoid **double-counting** the cash movement — the interlock
  comment (L165–168) says a feed line already linked to an internal `banking.transfers` row already has its
  cash movement covered by that transfer's own JE (Surface A), so it *must never ALSO post here*. `matched_transfer_id`
  is the shared dedupe key between `transfers.service.ts`, `match.service.ts`, and the bank-feed poster.
- **The hole:** a bank-feed line that the operator marks as a **transfer but that is NOT paired to a
  `banking.transfers` row** (no `matched_transfer_id`, no `destination_bank_account_id`) is skipped by B **and**
  never created A, so the inter-account movement gets **no journal entry at all** — the two legs of the transfer
  never net in the GL, and reconciliation can't tie the pair.

**Root cause:** the bank-feed categorize UI lets an operator label a line `transfer` as a terminal state
without forcing it to be *paired* to the opposite-account line (which is what would mint the `banking.transfers`
row + its JE via Surface A). It is a **missing pairing requirement**, not a missing poster — the poster already
exists and is proven (Surface A reuses `postSourceTransaction`).

---

## 2. Design options (owner picks — do NOT build without `JORGE-APPROVED`)

### Option 1 (RECOMMENDED) — categorizing a feed line `transfer` must pair to the destination account
Make "Transfer" in the categorize panel open the **existing transfer-pairing flow** (pick the opposite
bank/COA account), which mints a `banking.transfers` row via `createTransfer()`. The JE then flows through the
**already-proven Surface A poster** — zero new GL math, single dedupe key, `revoke` already reverses it.
- **Pro:** reuses the proven poster; no double-count risk (the B interlock already excludes matched lines);
  both legs net; reconciliation ties on `matched_transfer_id`.
- **Con:** UI change to the categorize panel (make destination-account required for `transfer`).
- **Files (future owner-gated PR):** `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`
  (transfer categorize → pairing modal, already partly present via the transfer modal), backend validation in
  `apps/backend/src/banking/categorization.routes.ts` to **reject** a terminal `transfer` categorization that
  lacks a paired `banking.transfers` row.

### Option 2 — post a self-balancing transfer JE directly from the feed categorize path
Add a flag-gated call in `bank-feed-gl-posting.service.ts` that, for an *unpaired* `transfer` line, posts a JE
using the existing poster with a "transfer clearing" account for the missing leg.
- **Con:** introduces a clearing-account concept and a second posting entry point for transfers → more
  reconciliation surface, higher double-count risk if the pairing later arrives. **Not recommended.**

### Option 3 — treat unpaired `transfer` as an invalid terminal state (guard-only, no posting)
Keep zero posting on B, but **block** an operator from leaving a feed line in `transfer` state without a pair
(surface it in the "needs attention"/uncategorized KPI). Cheapest; defers the money question but removes the
silent-no-JE hole.

---

## 3. Linkage law (Clause 3) — what any future build must wire

`banking.bank_transactions` ↔ `banking.transfers` (via `matched_transfer_id`) ↔ `accounting.journal_entries`
↔ `catalogs.accounts` (both legs) ↔ `audit.row_changes`; per `operating_company_id`; reversible (void-not-delete
through `revokeTransfer` / `reversePostedSourceTransaction`).

## 4. Guard plan (Rule 16 — future PR ships a guard)
- Extend/author `scripts/verify-bank-feed-gl-posting.mjs` (exists) to assert the chosen invariant: either
  (Opt 1/3) **no feed line may sit in terminal `transfer` state without a paired `banking.transfers` row**, or
  (Opt 2) the clearing-account posting path is flag-gated + balanced. Wire via `scripts/verify-steps/` (Rule 17).

## 5. Owner decision needed
1. Approve **Option 1 / 2 / 3** (recommend **Option 1**).
2. If Option 1/2, confirm `TRANSFER_GL_POSTING_ENABLED` stays **OFF** until the per-entity Neon tie-out is run.

**No code ships from this document.** Builder stops here (financial cluster, Rule 13).
