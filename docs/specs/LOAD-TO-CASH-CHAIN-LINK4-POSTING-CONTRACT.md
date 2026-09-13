# LOAD-TO-CASH CHAIN — Link 4 Posting Contract (bank txn → matched document)

**Author:** CC-1 · **Issued against:** Claude Lead, "LOAD-TO-CASH CHAIN — THE POSTING CONTRACT" (2026-09-12 20:05 CT/2026-09-13 01:05Z) · **For:** CC-2's matcher/review-queue (moves above ROUND 21.2) · **Deadline:** 2026-09-13 16:00Z

**Scope discipline, stated up front:** this is a contract, not code. Every posting path below already
exists and is cited by file + exported symbol. **No new GL math is proposed anywhere in this
document.** Where no existing posting function covers a case, that is stated as an open question for
the Lead, not filled in with an invented one.

**The verb that matters:** "match" and "categorize" are two different, already-built subsystems with
different contracts. CC-2's new matcher is for **matching a bank line to a document that was already
posted independently** (an expense, a bill payment, an invoice payment). It is NOT the categorization
path (`apps/backend/src/banking/bank-feed-gl-posting.service.ts`, CHAIN-05) — that path is for a bank
line with **no matching document at all**, where the operator assigns a GL account directly and THAT
assignment is what creates the JE. Do not conflate the two; a line that already has
`matched_bill_id`/`matched_expense_id` etc. must never also flow through the categorization poster
(`bank-feed-gl-posting.service.ts`'s own interlock #2 already enforces half of this — see below).

---

## The existing engine: `acceptMatchWithResolveDifference`

`apps/backend/src/accounting/bank-recon/match.service.ts`, exported function
`acceptMatchWithResolveDifference(input: ResolveDifferenceInput)`. This is the function CC-2's
"confirm" action calls for 3 of the 6 match types (`expense`, `bill_payment`, `payment` — the
`PERSISTABLE_MATCH_KINDS` set). It always does, regardless of kind:

1. Locks the bank transaction row (`FOR UPDATE`) and asserts it isn't in a closed reconciliation
   session and isn't already `review_state='matched'` — **this IS the idempotency guarantee for (e)**,
   see below.
2. Computes `varianceCents = |bank amount| - |ledger amount|` and a match-quality `score`.
3. Writes the match record to `banking.reconciliation_matches` (`storeMatch`).
4. Posts the **variance-only** JE via the private `postDifferenceJournalEntry` — **skipped entirely
   when `varianceCents === 0`** (the common case: bank amount equals the document's own amount, so
   nothing new posts because the document's own creation already posted the real economics).
5. Sets `bank_transactions.review_state='matched'`, `reviewed_at=now()`, and the one denormalized
   `matched_<kind>_id` column (`MATCHED_COLUMN_BY_KIND`), gated `WHERE review_state <> 'matched'`.
6. Kind-specific backlink/sweep steps (below).

### (a)/(b) per match type — JE and reused function

| Match type | (a) What JE posts | (b) Existing function |
|---|---|---|
| **→ expense** | **None**, unless variance ≠ 0 (then the variance-only JE, step 4 above). The expense's own JE was already posted when the expense was created/approved (`accounting.expenses.posting_status='posted'` is asserted as a precondition — an unposted expense cannot be matched, by design). | `acceptMatchWithResolveDifference` (kind `'expense'`) |
| **→ bill payment** | **None**, unless variance ≠ 0. The bill payment's own JE (DR A/P / CR Bank, by role) already posted when the bill payment record was created via CHAIN-04. This match step additionally backfills `bill_payments.source_bank_transaction_id`, `from_bank_account_id`, `cleared_date` (COALESCE-only, never overwrites an existing value). | `acceptMatchWithResolveDifference` (kind `'bill_payment'`); the bill payment's own posting is `postBillPaymentGlIfEnabled` (`apps/backend/src/accounting/bill-payment-gl.service.ts`, CHAIN-04) |
| **→ bill** (directly, no bill_payment yet) | **Not a persistable match kind today.** `PERSISTABLE_MATCH_KINDS` explicitly excludes `'bill'` — the code comment names it "a read-only suggestion." Matching a bank line straight to an open bill means "pay this bill with this money," which requires **minting a real `bill_payment` row first** (so A/P actually clears), then matching to *that* — i.e. this case reduces to the bill_payment row above. | The bill's own original JE is `postBillGlIfEnabled` (`apps/backend/src/accounting/bill-gl.service.ts`, CHAIN-03) — unrelated to the match step. The bill→payment minting is the existing bill-payment creation flow (`apps/backend/src/accounting/bill-payment-gl.routes.ts` / `.service.ts`) — CC-2's UI should offer "record payment" against the candidate bill, which produces a bill_payment, which is then the actual matched document. |
| **→ invoice payment** | **None** for the payment's own economics (already posted DR A/R / CR Unbilled at the two-event revrec latch, then DR Cash/Undeposited Funds / CR A/R at payment receipt), unless variance ≠ 0. **Plus** a best-effort "deposit sweep" JE via `postSourceTransactionInClientTx` (source type `'customer_payment_deposit'`) that moves the payment's GL out of Undeposited Funds / cash-clearing into the real matched bank account's own ledger account — this is what makes bank reconciliation of deposits actually tie out. Also backfills `payments.source_bank_transaction_id`, `cleared_date`, and (one-time, fill-only-if-NULL) `matched_invoice_id` via `backlinkBankTransactionToInvoice`. | `acceptMatchWithResolveDifference` (kind `'payment'`); the deposit sweep reuses `postSourceTransaction` (`apps/backend/src/accounting/posting-engine.service.ts`) |
| **→ settlement** (driver net-pay) | **OPEN QUESTION — no existing posting function covers this. Reporting the gap, not inventing one.** The settlement's own cost/liability JE (DR Cost-of-Labor / CR Driver Net-Pay Clearing, role `driver_pay_expense`/`driver_payroll_clearing`) already posts at settlement **close** (`settlement-payrun-close.service.ts`). Settlement **payment tracking** (`settlement-payment.service.ts`'s `markCleared`/`markSentToBank`/`markBounced`) is pure status (`payment_state`), audit, and a sync-job enqueue — **it posts no JE at all**, confirmed by reading the function body. There is currently no code path that clears the `Driver Net-Pay Clearing` (2170) liability against the bank account when a driver is actually paid via a real bank transfer — matching a bank line to a settlement today can only be a **link+status-update**, mirroring `apps/backend/src/banking/reconciliation.routes.ts`'s existing `load`/`bill`/`settlement` match handler (matched_event_type='settlement'), which itself posts nothing. **Recommend CC-2's PR 1 (read-only) surfaces settlement candidates and calls `markCleared`/`markSentToBank` on confirm — no JE — and this gap (does the 2170 liability need a clearing JE, and via which existing function) goes back to the Lead as its own question before any settlement-JE code is written.** | `settlement-payment.service.ts`'s `markCleared`/`markSentToBank`/`markBounced` (status only, no JE) |
| **→ transfer** (bank-to-bank) | The transfer's own balanced two-leg JE (DR destination bank / CR source bank, both role `cash_dip`/`operating_bank`-class accounts) — genuinely no P&L impact, cash moving between the entity's own accounts. | `markBankFeedLineAsTransfer` (`apps/backend/src/banking/transfers.service.ts`), which calls `createTransfer` → `postSourceTransaction` (source type `'transfer'`) |

### (c) UNMATCH — what happens

Not found as an existing "unmatch" function during this pass — the codebase currently has `voidBill`/
`revokeTransfer` style reversal functions per-document, but no single generic "undo an
`acceptMatchWithResolveDifference` result" entrypoint was located. Per kind:
- **expense / bill_payment / payment**, variance was zero → unmatch is link-only: clear
  `review_state`/`matched_<kind>_id`/the `reconciliation_matches` row (void-not-delete: stamp
  `voided_at`/`void_reason` on the match row, the same pattern `reconciliation.routes.ts`'s own
  `matched_bill_id = NULL` clear-paths already use). **Nothing to reverse — nothing posted.**
- **expense / bill_payment / payment**, variance ≠ 0 → the variance JE **must be reversed**, not
  deleted (void-not-delete). No existing single-call "reverse a bank-recon variance JE" function was
  found in this pass — flagging this as a real gap CC-2's unmatch action needs, likely a thin wrapper
  around the same reversal pattern `posting-engine.service.ts`/`void.service.ts` already use
  elsewhere (`reversePostedSourceTransaction` exists and is imported by `transfers.service.ts` — worth
  checking whether it generalizes to a bank-recon variance JE before building a new one).
- **transfer** → `revokeTransfer` (`transfers.service.ts:521`) already exists and is the reversal path.
- **settlement** → no JE ever posted (see above), so unmatch is link/status-only, no reversal needed.

### (d) categorization_gl_account_id vs. the matched document's account

**The matched document's account always wins; `categorization_gl_account_id` never applies to a
matched line.** Categorization (CHAIN-05, `bank-feed-gl-posting.service.ts`) and matching are mutually
exclusive by the existing interlocks: that service's own interlock #2 skips a row already
`matched_bill_id` (reason `already_matched_to_bill`), and `acceptMatchWithResolveDifference` itself
refuses a transaction already `review_state='matched'`. A bank line is either **categorized** (no
matching document — the operator's chosen account IS the economics) or **matched** (a document already
carries its own account via its own posting) — never both, and the match path takes precedence because
matching implies a document that already resolved the real account through its own posting function.
CC-2's UI should offer "match" as a candidate action distinct from "categorize," never let a user pick
both for the same line, and the same-line interlock (`already_matched_to_bill` and its siblings) is
the enforcement point — extend that interlock's kind list if `expense`/`payment`/`bill_payment`
matched-columns aren't already covered by it (worth CC-2 confirming against the current interlock
list, not assumed here).

### (e) Idempotency

Built into `acceptMatchWithResolveDifference` itself, not something CC-2's caller needs to add:
1. The bank transaction is locked `FOR UPDATE` for the whole flow.
2. `if (txn.review_state === "matched") throw "bank_transaction_already_matched"` — checked at read
   time.
3. The final `UPDATE ... WHERE review_state <> 'matched'` is a second, race-safe check (`FOR UPDATE`
   plus a `WHERE` guard) — a concurrent double-accept gets `bank_transaction_already_matched` from the
   zero-rowcount branch, never a second JE.
4. `storeMatch`'s `reconciliation_matches` INSERT uses `ON CONFLICT (bank_transaction_id,
   ledger_entry_kind, ledger_entry_id) DO UPDATE` — a retry of the identical match is a no-op update,
   not a duplicate row.
5. The variance JE only fires once per accept (protected by the same lock + `review_state` guard above)
   — accepting the same suggestion twice cannot double-post because the second attempt never reaches
   step 4 at all.

**Net: CC-2's UI does not need its own idempotency layer for confirm.** A double-click / retried
request on the same suggestion is already safe; the second call surfaces
`bank_transaction_already_matched` and CC-2 should treat that as a benign "already done," not an error
banner.

---

## Summary for the Lead

- 3 of 6 match types (expense, bill_payment, invoice payment) are **fully covered** by one existing,
  well-hardened function (`acceptMatchWithResolveDifference`) — CC-2 builds candidates, a human
  confirms, this function does the rest, no new GL math needed.
- **bill** isn't directly matchable — it resolves to **bill_payment** once a payment is minted against
  it via the existing CHAIN-04 flow.
- **transfer** is fully covered by an existing, separate function (`markBankFeedLineAsTransfer`).
- **settlement** is the one real gap: no existing function clears the Driver Net-Pay Clearing
  liability against a bank payment. Recommending CC-2 ship it as link/status-only in PR 1 (matching
  the existing reconciliation-route precedent that already does exactly that for settlement/bill/load
  kinds) and routing the "does this need a new JE, and if so what's the account role" question back to
  you rather than inventing one here.
- **Unmatch/reversal** has one more real gap worth a quick look before CC-2's PR 2: no single generic
  "reverse a bank-recon variance JE" function was found in this pass; `reversePostedSourceTransaction`
  (already used by `transfers.service.ts`) is the most likely existing candidate to reuse — recommend
  confirming that before writing anything new.
