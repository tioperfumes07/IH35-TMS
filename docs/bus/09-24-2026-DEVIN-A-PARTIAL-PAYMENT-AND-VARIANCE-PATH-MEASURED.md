# PARTIAL BILL PAYMENT AND VARIANCE PATH — MEASURED

**Seat:** DEVIN-A · **Round:** 140.5 · **Mode:** READ-ONLY audit (zero writes, zero test rows)
**Measured:** 2026-09-24 02:30 UTC · **Method:** Live Neon (bypass_rls='lucia', USMCA), source code reading
**Production sha:** d99366fa52f9b5a83f00599d4a7420760cb892fc

---

## Q1: Does a partial bill payment posting path exist?

**YES. Two paths exist.**

### Path A — `payBill` (primary, updates paid_cents + status)

**Function:** `payBill` · **File:** `apps/backend/src/accounting/bills.service.ts:2764`

When a bank payment is smaller than the bill it pays ($1,000 against a $1,400 open bill):

1. Locks the bill `FOR UPDATE` (line 2798).
2. Refuses if `bill.status === "paid"` (line 2807) — but does NOT refuse `"partial"`.
3. Computes `remaining = amount_cents - paid_cents - appliedCredits - appliedPaymentApplications` (line 2818).
4. Throws `payment_exceeds_remaining_balance` only if `amountCents > remaining` (line 2819) — a partial payment passes this check.
5. Inserts a row into `accounting.bill_payments` (line 2821).
6. Computes `newPaidCents = paid_cents + amountCents` (line 2873).
7. Computes `storageStatus = storageStatusForPaid(total, newPaidCents)` — returns `"partially_paid"` when `0 < paid < total` (line 769-773).
8. `UPDATE accounting.bills SET paid_cents, paid_amount, status` (line 2875-2885).
9. GL posting is gated by `BILL_PAYMENT_GL_POSTING_ENABLED` (flag-gated, default OFF — line 2776).

**Result:** $1,000 against a $1,400 bill relieves exactly $1,000 of A/P, leaves the bill at $400 open, and sets `status = 'partially_paid'`.

### Path B — `applyToBill` (payment-applications, does NOT update paid_cents)

**Function:** `applyToBill` · **File:** `apps/backend/src/accounting/payments/apply.service.ts:206`

1. Locks the bill `FOR UPDATE` (line 220-233).
2. Computes `billOpen = max(0, billTotal - billPaid - appliedCredits - appliedPaymentApplications)` (line 251).
3. Throws `amount_exceeds_bill_open` if `amount_cents > billOpen` (line 252-254) — partial passes.
4. Inserts into `accounting.payment_applications` with `target_kind='bill'` (line 256-276).
5. Does NOT update `bills.paid_cents` — by design (ACCT-F5691, line 240-246). The bill's open balance is computed on the READ side via `BILL_OPEN_BALANCE_SQL` which nets `paid_cents + vendor credits + payment_applications` (bills.service.ts:553).
6. GL posting is gated by `CUSTOMER_PAYMENT_GL_POSTING_ENABLED` (apply.service.ts:365, default OFF).

**Result:** $1,000 against a $1,400 bill inserts a `payment_applications` row for $1,000. The bill's `paid_cents` stays at 0, but the READ-side `BILL_OPEN_BALANCE_SQL` computes the open balance as $400.

---

## Q2: Does accounting.bills carry a live remaining-balance concept?

**YES — via `paid_cents` (bigint) + `amount_cents` (bigint). No `balance` column exists.**

**Schema (live, information_schema):**

| column | type |
|--------|------|
| `amount_cents` | bigint |
| `paid_cents` | bigint |
| `paid_amount` | numeric |
| `status` | text |

There is NO `balance`, `balance_cents`, `amount_paid`, or `amount_open_cents` column. Balance is always computed as `amount_cents - paid_cents` (or the fuller `BILL_OPEN_BALANCE_SQL` that nets credits + payment_applications).

**Status is NOT a boolean flip — it is a derived text column with four values:**

| `canonicalStatus` input | output | (bills.service.ts:762) |
|--------------------------|--------|------------------------|
| `revoked_at` set / `void` / `voided` | `voided` | |
| `paid_cents <= 0` | `open` | |
| `paid_cents >= amount_cents` | `paid` | |
| otherwise | `partial` | |

The storage layer uses a parallel set: `unpaid` / `partially_paid` / `paid` / `void` (`storageStatusForPaid`, line 769-773). Both `partial` and `partially_paid` map to the same "partially paid" concept.

**Live USMCA measurement (bypass_rls='lucia'):**

```
USMCA bills (is_sample_data IS NOT TRUE, revoked_at IS NULL): 0 rows
USMCA bill_payments: 0
USMCA payment_applications (target_kind='bill'): 0
USMCA payments: 0
```

The feed has not yet created any USMCA bills. The partial payment path is built but unexercised on USMCA.

**Live ALL-entities measurement (for reference, TRANSP mirror):**

```
 status  | count 
---------+-------
 paid    | 14608
 unpaid  |  1112
 partial |   526
 draft   |     1
```

526 bills carry a partial payment (`paid_cents > 0 AND paid_cents < amount_cents`). 1,113 are fully unpaid. 14,608 are fully paid.

---

## Q3: How many times has acceptMatchWithResolveDifference ACTUALLY posted on live?

**ZERO live variance JEs exist. ONE orphaned audit event exists.**

**Measured (bypass_rls='lucia'):**

```
audit.audit_events WHERE event_class = 'accounting.bank_reconciliation.variance_posted': 1 row
accounting.journal_entries WHERE id = (the JE referenced by that audit event): 0 rows (MISSING)
accounting.journal_entry_postings WHERE idempotency_key LIKE 'bank-recon-var:%': 0 rows
```

**The one audit event:**
```
uuid:        03c158b1-c5f8-4a0f-b1ea-b5070fb568ab
created_at:  2026-08-25 05:20:19 UTC
event_class: accounting.bank_reconciliation.variance_posted
source:      CODER-12-BANK-RECON-SPINE
payload:     {"variance_cents": -44500,
              "journal_entry_id": "f5ad8dca-8c86-411d-9ae1-b362c53e0041",
              "bank_transaction_id": "aa2d7bb2-df57-4260-8611-711272a35b65"}
```

**The JE it references does NOT exist.** The bank transaction it references (`aa2d7bb2...`, USMCA, $755.00) still reads `review_state = 'for_review'` — it was never matched.

**Interpretation:** The variance posting path wrote an audit event on 2026-08-25, but the JE it references is gone (purged by AUTH-001 wipe or the transaction rolled back after the audit event was written in a separate connection). The bank transaction was never cleared. The path has NEVER successfully posted a live variance JE that survives today.

**The owner's belief is correct: the path has never run in anger.** The one audit event is an orphan, not evidence of a successful post.

---

## Q4: Is the variance JE path single-entry only?

**YES — single-entry only.**

**Signature (match.service.ts:101-108):**

```typescript
export type ResolveDifferenceInput = {
  operating_company_id: string;
  bank_transaction_id: string;       // ONE bank transaction
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;  // ONE ledger entry kind
  ledger_entry_id: string;            // ONE ledger entry id
  difference_account_id: string;      // ONE difference account
};
```

The function `acceptMatchWithResolveDifference` (match.service.ts:1072) takes exactly:
- ONE `bank_transaction_id`
- ONE `ledger_entry_kind` + ONE `ledger_entry_id`
- ONE `difference_account_id`

It computes `varianceCents = txnAmountAbs - ledgerAmountAbs` (line 1115) — a single bank line against a single ledger document. To take N selected ledger documents instead of 1, the signature would need to change to accept an array of `{ ledger_entry_kind, ledger_entry_id }` pairs and the variance math would need to aggregate across all N.

---

## Summary

| Q | Answer |
|---|--------|
| Q1 | YES — `payBill` (bills.service.ts:2764) and `applyToBill` (apply.service.ts:206) both support partial payments |
| Q2 | `paid_cents` + `amount_cents` (no `balance` column). Status is derived text, not boolean. USMCA: 0 bills. All-entities: 526 partial, 1,113 unpaid, 14,608 paid |
| Q3 | ZERO live variance JEs. ONE orphaned audit event (2026-08-25) whose JE is missing. Path has never posted successfully |
| Q4 | YES — single-entry only. `ResolveDifferenceInput` takes one bank_transaction_id + one ledger_entry_id. Signature change needed for N documents |

**No writes performed. No test rows created. Read-only audit complete.**
