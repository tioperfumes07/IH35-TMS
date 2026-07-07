# CHAIN-04 — Bill → Bill-Payment → Bank Tie-Out Proof (Design Doc)

**Status:** `[HOLD-FOR-JORGE — TIER 1 FINANCIAL]` — design doc + **read-only** proof only. No posting
code, no migration, no flag flip, no live write. (CLAUDE.md §1.4/§1.7.)

**Relationship to the existing CHAIN-04 doc.** `CHAIN-04-BILL-PAYMENT-POSTING-DESIGN.md` (404 lines,
already in-tree) specifies the **GL mechanics** of `buildBillPaymentLines` (DR `ap_control` / CR bank) —
that half is fully designed and its poster + flag (`BILL_PAYMENT_GL_POSTING_ENABLED`) already exist in
code, gated OFF. **This doc covers the piece that doc explicitly deferred**: the **bank-line link** —
proving `accounting.bills → accounting.bill_payments → banking.bank_transactions` ties out to the penny,
and specifying the write path (`bank-recon` "Part 2b") that the memory `bank-recon-part2a-hold` names as
blocked on CHAIN-04. Nothing here duplicates or contradicts the GL-mechanics doc.

---

## 1. Purpose + the live gap

`apps/backend/src/accounting/bank-recon/match.service.ts` already suggests **open bills** as match
candidates for a withdrawal bank line (`fetchLedgerCandidates`, kind `"bill"`), but refuses to let a user
**accept** one (`PERSISTABLE_MATCH_KINDS` excludes `"bill"`; `acceptMatchWithResolveDifference` throws
`match_kind_not_acceptable:bill`). The code comment is explicit about why:

> *"'bill' remains NON-persistable: recording a bill payment with no GL JE is an orphan write — that's
> Part 2b (BLOCK-02 CHAIN-04), still gated."*

Accepting a `bill` candidate must **atomically create the missing `accounting.bill_payments` row**
(there is no bill_payment yet — the bank line is being matched directly to the open bill) — never leave a
bank line marked "matched" against a bill with no payment record, and never leave a new bill_payment row
with no bank link. This doc supplies (a) the **tie-out invariant** that proves the three tables already
reconcile to the penny for every **existing** bill_payment↔bank_transaction pair (the evidence gate before
building the write path), and (b) the **exact design** for the write path itself (Part 2b), so Jorge can
authorize the build in a follow-up PR. **This PR ships (a) only** — read-only proof, no write code.

## 2. Ground truth (verified against `db/migrations/`, not assumed)

| Table | Migration(s) | Verified columns used below |
| --- | --- | --- |
| `accounting.bills` | `0073`, `0090` | `amount_cents`, `paid_cents`, `status` (plain `text`, **no CHECK/enum**), `revoked_at` (**no `voided_at`** on this table) |
| `accounting.bill_payments` | `0073`, `0090` | `bill_id` (FK, `NOT NULL`), `amount_cents`, `from_bank_account_id`, `payment_date`, `payment_method` (`text`, no DB CHECK), `revoked_at`, `status` |
| `banking.bank_transactions` | `0073`, `0182`, `202607011600` | `amount_cents` (Plaid-**signed**), `is_credit` (bool), `matched_bill_id`, `matched_bill_payment_id`, `matched_expense_id`, `matched_payment_id`, `matched_transfer_id`, `matched_journal_entry_id`, `review_state` CHECK `('for_review','categorized','excluded','matched','transfer')` |
| `bank.reconciliation_matches` | `0219`, `202607011600` | `ledger_entry_kind` CHECK now `('payment','bill_payment','transfer','je','expense')` — **`'bill'` intentionally excluded** (this is what Part 2b changes: it never inserts kind `'bill'`; it inserts kind `'bill_payment'` for the **newly created** payment) |

**Key finding: no schema change is required.** Every column `matched_bill_payment_id` needs already
exists (`0182`), the `bill_payment` kind is already in the CHECK (`0219`/`202607011600`), and
`accounting.bill_payments.payment_method` has no DB CHECK to widen. **No HELD migration accompanies this
PR.**

## 3. The tie-out invariant (to the penny)

For operating_company_id = TRANSP (or any entity), across every **non-revoked** bill_payment:

- **Leg A — bill ↔ its payments (subledger tie-out).**
  `accounting.bills.paid_cents` = `SUM(accounting.bill_payments.amount_cents WHERE bill_id = bills.id AND
  revoked_at IS NULL)`. This must hold **independent of the bank** — it is `payBill()`'s own invariant
  (`bills.service.ts` recomputes `paid_cents` on every payment/void) and is the first proof any bank-tie-out
  proof depends on.
- **Leg B — payment ↔ bank line (the missing link CHAIN-04/Part 2b closes).** For every bill_payment
  matched to a bank transaction — via the denormalized `bank_transactions.matched_bill_payment_id` **or**
  an active `bank.reconciliation_matches` row (`ledger_entry_kind='bill_payment'`,
  `match_state IN ('auto_matched','user_matched')`) — `ABS(bank_transactions.amount_cents)` =
  `bill_payments.amount_cents` **to the penny**, and `bank_transactions.is_credit = false` (paying a bill
  is money OUT; a bill payment linked to a deposit is a direction defect, never a rounding issue).
- **Leg C — bijection.** A given `bill_payment` clears **at most one** bank line and vice versa
  (`bank_transactions.matched_bill_payment_id` is 1:1 with the payment it clears — no bank line double-counts
  a payment, no payment is claimed by two bank lines).
- **Leg D — GL, only when `BILL_PAYMENT_GL_POSTING_ENABLED` is ON for the entity (still OFF everywhere
  today).** `SUM(journal_entry_postings WHERE source_transaction_type='bill_payment' AND
  source_transaction_id=<bill_payment.id> AND debit_or_credit='debit')` (the `ap_control` leg) =
  `bill_payments.amount_cents` = the matching credit leg (bank ledger account). This is the existing
  GL-mechanics doc's invariant, restated here only to show it composes with Legs A–C without contradiction.

**Definition of "tied out" for this chain:** Legs A–C hold for every row **today** (before Part 2b ships,
using the existing manual Pay-Bill + separate bank-match flow), and Leg D holds additionally once the GL
flag is flipped. Part 2b's write path (§5) is designed so it can only ever produce rows that already
satisfy A–C by construction (the amounts are copied from the same source, not independently entered).

## 4. Read-only tie-out SQL (single source — used by both the guard script and the `.db.test` proof)

```sql
-- (1) Leg A — bill.paid_cents must equal the live sum of its own non-revoked bill_payments.
SELECT b.id AS bill_id, b.operating_company_id, b.paid_cents AS bill_paid_cents,
       COALESCE(SUM(bp.amount_cents), 0)::bigint AS payments_sum_cents
  FROM accounting.bills b
  LEFT JOIN accounting.bill_payments bp
    ON bp.bill_id = b.id AND bp.revoked_at IS NULL
 WHERE b.revoked_at IS NULL
 GROUP BY b.id, b.operating_company_id, b.paid_cents
HAVING b.paid_cents <> COALESCE(SUM(bp.amount_cents), 0);
-- MUST be empty. Any row = the bill header has drifted from its own payment subledger.

-- (2) Leg B — amount + direction mismatch between a matched bill_payment and its bank line.
SELECT bt.id AS bank_transaction_id, bp.id AS bill_payment_id,
       bt.amount_cents AS bank_amount_cents, bp.amount_cents AS payment_amount_cents,
       bt.is_credit
  FROM banking.bank_transactions bt
  JOIN accounting.bill_payments bp ON bp.id = bt.matched_bill_payment_id
 WHERE bp.revoked_at IS NULL
   AND (ABS(bt.amount_cents) <> bp.amount_cents OR bt.is_credit = true);
-- MUST be empty. Any row = a penny break or a deposit wrongly linked to a bill payment.

-- (3) Leg C — bijection: a bank line must not double-claim a bill_payment, and vice versa.
SELECT matched_bill_payment_id, COUNT(*) AS bank_lines_claiming_it
  FROM banking.bank_transactions
 WHERE matched_bill_payment_id IS NOT NULL
 GROUP BY matched_bill_payment_id
HAVING COUNT(*) > 1;
-- MUST be empty.

-- (4) Informational (not a failure today — Part 2b is not yet live): bill_payments that came from a
-- bank-funded payment method but have no bank-line link yet. Once Part 2b ships this becomes a real
-- orphan-write check; today it is a coverage read only.
SELECT bp.id, bp.operating_company_id, bp.amount_cents, bp.payment_method, bp.from_bank_account_id
  FROM accounting.bill_payments bp
 WHERE bp.revoked_at IS NULL
   AND bp.from_bank_account_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_bill_payment_id = bp.id
   );
```

Implementation: `scripts/verify-chain-04-bill-payment-bank-tieout.mjs` (§6) runs (1)–(3) live,
degrade-safe (skips cleanly with no `DATABASE_URL`, mirroring `verify-balanced-ledger.mjs`); (4) is
reported but never fails the guard. `apps/backend/src/accounting/bank-recon/__tests__/chain-04-bill-payment-bank-tieout.db.test.ts`
(§7) proves the same three queries against seeded CI-Postgres data.

## 5. Part 2b — the accept-bill write path (DESIGN ONLY, not built in this PR)

When a user accepts a `"bill"` candidate in `acceptMatchWithResolveDifference` (`match.service.ts`), the
handler must, **in one DB transaction** (all-or-nothing — never a bank line marked `matched` without a
real bill_payment, never a bill_payment with no bank link):

1. **Validate direction + amount.** Reject if `txn.is_credit` (a bill is money-out only — already true by
   construction since `'bill'` candidates are only ever fetched for `!isCredit`, §`fetchLedgerCandidates`).
   Compute `applied_cents = MIN(bank_amount_abs, bill.amount_cents - bill.paid_cents)` — never more than
   the bill's open balance (mirrors `payBill()`'s `payment_exceeds_remaining_balance` guard; an
   over-the-bank-amount bill balance is a **partial** accept, not an error).
2. **Insert the bill_payment — reuse `payBill()`'s exact INSERT, not a second hand-written statement**
   (`bills.service.ts` lines ~740–760): `operating_company_id`, `bill_id`, `vendor_id` (from the bill row),
   `payment_date = txn.transaction_date`, `amount_cents = applied_cents`, `amount = applied_cents/100`,
   `payment_method = 'ach'` (the closest existing accepted value — `payment_method` has no DB CHECK to
   widen, and the zod enum in `vendor-bill-payments.routes.ts` is `check|ach|wire|cash|credit_card`; `'ach'`
   avoids inventing a new value), `from_bank_account_id = txn.bank_account_id`, `status = 'posted'`,
   `created_by_user_id = actor`.
3. **Update the bill — reuse `storageStatusForPaid()` verbatim** (same function `payBill()` calls) so the
   status transition logic never forks into a second implementation.
4. **Post GL if enabled — reuse `postBillPaymentGlIfEnabled()` verbatim** (no new GL math; no-ops when
   `BILL_PAYMENT_GL_POSTING_ENABLED` is OFF for the entity, which it is today).
5. **Link + clear — reuse the existing `storeMatch()` + `MATCHED_COLUMN_BY_KIND` path verbatim**: insert
   `bank.reconciliation_matches` with `ledger_entry_kind='bill_payment'` (already a persistable kind —
   **no CHECK widen needed**, the row is for the *new* bill_payment, never `kind='bill'`), then
   `UPDATE banking.bank_transactions SET review_state='matched', matched_bill_payment_id=<new id>`.
6. Any step failing rolls back the whole transaction — by construction, a partial state (payment row with
   no match, or a bank line marked matched with no real payment) cannot exist once this ships, which is
   exactly Legs A–C above.

**No new GL math, no new resolver, no new status-derivation function** — every step reuses an existing,
already-proven function. The only new code is the transaction wrapper + the direction/amount validation
gate, matching the reuse rule already honored by the expense-accept path (Part 2a).

## 6. Guard script

`scripts/verify-chain-04-bill-payment-bank-tieout.mjs` — degrade-safe (skips with no `DATABASE_URL`,
never crashes CI), advisory by default (`CHAIN_04_TIEOUT_ENFORCE=true` to make it blocking), mirrors
`verify-balanced-ledger.mjs`'s single-source-`ASSERTIONS`-object pattern. Runs queries (1)–(3) above;
reports (4) as informational. Read-only — never repairs drift; a human fixes it via a new, reviewed
`bill_payment`/JE, per the void-not-delete convention.

## 7. Tests

`apps/backend/src/accounting/bank-recon/__tests__/chain-04-bill-payment-bank-tieout.db.test.ts`
(`describe.skipIf(process.env.GITHUB_ACTIONS !== "true")`, CI Postgres, bypass-RLS seed helper — same
harness as the existing bank-recon `.test.ts` files): seeds a bill + a bill_payment + a matching
`bank_transactions` row (`matched_bill_payment_id` set, `is_credit=false`, same `amount_cents`); asserts
queries (1)–(3) return zero rows. A second seeded case with a deliberately mismatched amount / wrong
`is_credit` / duplicate match asserts the query **catches** it (proves the guard is not a no-op).

## 8. Open decisions for Jorge

- **A.** Confirm `payment_method='ach'` (not a new `'bank_feed'` value) for Part 2b bill_payments created
  from a bank match — avoids any schema/enum widening. If Jorge wants a distinct value for reporting
  (e.g., to separate "matched from the bank feed" from a manually-entered ACH), that is a future additive
  column (`source_bank_transaction_id` already exists on `bill_payments` per the GL-mechanics doc §2 —
  reuse it as the "came from the bank feed" signal instead of overloading `payment_method`).
- **B.** Confirm partial accept is allowed (bank amount < bill open balance) the same way `payBill()`
  already allows a partial manual payment — recommended yes, for consistency; the bank line still clears
  in full (the bill just isn't fully paid yet, same as today's manual partial-pay UX).
- **C.** Sequencing: Part 2b should ship strictly after Jorge reviews this proof + the GL-mechanics doc
  together (a payment can now exist with a GL leg AND a bank leg at once) — recommend one combined
  Jorge review before either flag is touched.

---

## Guardrails honored
Design doc + **read-only** proof only · no schema change (verified, no migration in this PR) · reuses
`payBill()` / `storageStatusForPaid()` / `postBillPaymentGlIfEnabled()` / `storeMatch()` verbatim for the
(unbuilt) Part 2b write path — **no new GL math** · `[HOLD-FOR-JORGE — TIER 1]`, never self-merged (§1.4).
