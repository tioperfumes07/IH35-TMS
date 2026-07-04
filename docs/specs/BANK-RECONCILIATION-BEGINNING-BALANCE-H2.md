# H2 — Make Bank Reconciliation a Real Reconciliation (Beginning Balance)

**Status:** DESIGN — awaiting Jorge's OK (has a migration → §1.3 / §1.4 gate). Do NOT build/merge solo.
**Found by:** deep Banking sub-sweep, 2026-07-03.
**Scope:** `banking.reconciliation_sessions` (+ session start/complete routes, workspace UI). No GL posting.

---

## 1. The defect

The session-based reconciliation has **no beginning (opening) balance**, so it does not reconcile the
way QuickBooks / NetSuite / McLeod do.

Today (`apps/backend/src/banking/reconciliation.routes.ts`):

```
book_balance = Σ matched_credits − Σ matched_debits      // WITHIN the period only
variance     = statement_balance − book_balance
```
(`computeSummaryFromTransactions`, ~line 116; mirrored client-side in `ReconciliationWorkspace.tsx`.)

The auto-complete gate refuses to close unless `|variance| ≤ $10` (~line 633). But `book_balance`
starts from **zero every period** — it never carries the prior period's ending balance. So for any real
account (statement ending balance e.g. $50,000) the variance can essentially never reach ~0, and the
Owner is forced to **force-complete every reconciliation**. That makes the "difference must be $0"
contract meaningless and destroys the trust signal a reconciliation exists to provide.

## 2. The correct model (QBO/NetSuite parity)

A real reconciliation proves:

```
cleared_balance = beginning_balance
                + Σ cleared_deposits (money in, is_credit = true)
                − Σ cleared_payments (money out, is_credit = false)

difference      = statement_ending_balance − cleared_balance
reconciled  ⟺  difference == 0
```

- **beginning_balance** = the **cleared/reconciled ending balance of the prior reconciliation** for the
  same bank account (or the account's opening balance for the very first reconciliation).
- "cleared" = the transactions the user has checked off (here: matched) in THIS session.

## 3. Proposed change

### 3.1 Migration (idempotent, additive, gated)

```sql
-- NNNN_bank_recon_beginning_balance.sql  (number = above current max at push time)
ALTER TABLE banking.reconciliation_sessions
  ADD COLUMN IF NOT EXISTS beginning_balance_cents bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN banking.reconciliation_sessions.beginning_balance_cents IS
  'Cleared ending balance carried from the prior reconciled session for this bank account '
  '(or the account opening balance for the first reconciliation). cleared = beginning + Σcredits − Σdebits.';
```

No backfill needed for correctness going forward: existing rows default to 0 (their historical behavior),
and every NEW session captures the real beginning balance at start (§3.2). Void-not-delete unaffected.

### 3.2 Start route — capture beginning balance

On `POST /banking/reconciliation/start`, set `beginning_balance_cents` =
the `statement_balance_cents` of the most recent **reconciled** session for the same
`(operating_company_id, bank_account_id)` whose `period_end < new period_start`; if none exists, 0
(first reconciliation — the owner may later be given an explicit opening-balance entry, tracked separately).

```sql
SELECT statement_balance_cents
FROM banking.reconciliation_sessions
WHERE operating_company_id = $1 AND bank_account_id = $2
  AND status = 'reconciled' AND period_end < $3
ORDER BY period_end DESC
LIMIT 1;   -- COALESCE(..., 0)
```

### 3.3 Summary math — carry the beginning balance

```
cleared_balance = beginning_balance_cents
                + Σ matched credits (is_credit = true)
                − Σ matched debits  (is_credit = false)
difference      = statement_balance_cents − cleared_balance
```
Update `computeSummaryFromTransactions` (backend) **and** the mirror in `ReconciliationWorkspace.tsx`
so server and client agree. Persist `cleared_balance` into the existing `book_balance_cents` column
(rename in copy only — "Cleared balance" — no column rename needed) and `difference` into
`variance_cents`. The `|difference| ≤ $10` (or exact `== 0`, owner decision) gate then becomes reachable,
so normal closes stop requiring force-complete.

### 3.4 UI (workspace)

Show the standard reconciliation header block:
`Beginning balance … + Cleared deposits … − Cleared payments … = Cleared balance … | Statement ending … | Difference …`
with Difference turning to the locked navy (not red) when it hits $0. No new palette.

## 4. Open owner decisions

1. **Difference tolerance:** exact `$0.00` (strict QBO) vs the current `$10` band. Recommend **exact $0**
   for a real carrier reconciliation; keep force-complete for genuine bank errors (audited).
2. **First-reconciliation opening balance:** default 0, or add an explicit per-account opening-balance
   entry (owner-entered only, per §1.4 opening-balance rule). Recommend a follow-up for the explicit entry;
   0 is safe until then.

## 5. Guardrail (ships with the build)

`scripts/verify-recon-beginning-balance.mjs`: assert `computeSummaryFromTransactions` references
`beginning_balance_cents` (server can't silently regress to period-zero math).

## 6. Why gated

Adds a column to `banking.reconciliation_sessions` (a migration) and changes reconciliation math. Migration
= §1.3; touches money-reconciliation semantics = review-before-merge. This doc is the design; the build waits
for Jorge's explicit OK.
