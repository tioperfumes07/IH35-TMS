# Scope — a bank line must be able to match a fuel row (Cursor, 2026-09-22, Lead round 48, 3 of 3)

**Scope only. CC-1 authors the migration. Nothing here has been built.**

## The gap

With `fuel.fuel_transactions` canonical for fuel (Lead ruling, round 48), the bank line for a fuel purchase
must be matched to its fuel row — QuickBooks "Match": the bank line links to the existing document and posts
nothing new. Today that link cannot be recorded:

- `banking.bank_transactions` records a match through a family of pointer columns, each with its own foreign
  key: `matched_load_id`, `matched_bill_id`, `matched_settlement_id`, `matched_expense_id`
  (→ `accounting.expenses`), `matched_transfer_id`, `matched_journal_entry_id`, `matched_invoice_id`,
  `matched_payment_id`, `matched_bill_payment_id`, `matched_advance_id`. **None points at a fuel row.**
- `banking.reconciliation_matches.ledger_entry_kind` is constrained by
  `reconciliation_matches_ledger_entry_kind_check` to payment, bill_payment, transfer, je, expense, load, bill,
  settlement. **`fuel_transaction` is not allowed.**

## What the 76 Relay bank lines look like today (live, read-only)

`source_ref LIKE 'relay_fuel:%'`, 76 lines, $32,726.45:
- all 76 `status='categorized'`, `review_state='matched'`, `coa_account_id` set, 0 `matched_expense_id`;
- all 76 carry `matched_journal_entry_id` (59 also carry `matched_load_id` and `matched_settlement_id`);
- **76 of 76 point at a journal entry that is reversed or voided**, and **0 of 76** point at the fuel posting of
  the fuel row the feed created. The register shows them reconciled; the match behind each one is dead.
- 0 rows in `banking.reconciliation_matches` for any of them.

## 1 — Migration (CC-1, one author, idempotent, CREATE-only)

```sql
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_fuel_transaction_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bank_transactions_matched_fuel_transaction_id_fkey') THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_fuel_transaction_id_fkey
      FOREIGN KEY (matched_fuel_transaction_id) REFERENCES fuel.fuel_transactions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_fuel_transaction_id
  ON banking.bank_transactions (matched_fuel_transaction_id)
  WHERE matched_fuel_transaction_id IS NOT NULL;

ALTER TABLE banking.reconciliation_matches
  DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;
ALTER TABLE banking.reconciliation_matches
  ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
  CHECK (ledger_entry_kind = ANY (ARRAY['payment','bill_payment','transfer','je','expense','load','bill',
                                        'settlement','fuel_transaction']));
```

No backfill inside the migration. The new column inherits the table's RLS and grants. The CHECK only widens.

## 2 — Code: every place that lists the pointer family must learn the new one

If a file enumerates the `matched_*` columns and is not updated, a fuel-matched bank line reads as
**unmatched** there. From `git grep matched_expense_id` on main (non-test):

| file | what it does | seat |
|---|---|---|
| `banking/reconciliation.routes.ts` :198, :651 | the "is matched" boolean; row type | CC-2 |
| `banking/link-suggestions-actions.routes.ts` :109, :127, :322 | unmatched predicate; accept; un-accept | CC-2 |
| `banking/link-suggestion-engine.ts`, `banking/link-suggestions.routes.ts` | suggestion targets | CC-2 |
| `banking/banking-rules.engine.ts`, `banking/p7-wave2.routes.ts` | rules / wave-2 readers | CC-2 |
| `integrations/plaid/link.routes.ts` (10 refs) | Plaid match readers | CC-2 |
| `accounting/bank-recon/match.service.ts` :47 | kind → column map — add `fuel_transaction: "matched_fuel_transaction_id"` | CC-1 |
| `accounting/bank-recon/recon-worklist.service.ts` :307–334 | unmatch / reset | CC-1 |
| `accounting/void.service.ts` :326–461 | clears the pointer family when a document is voided — must clear the fuel pointer when a fuel row is voided or archived | CC-1 |
| `cash-flow/cash-flow.service.ts` :1214–1237 | "is this expense paid" via `matched_expense_id` — must also count fuel | unowned — Lead assigns |
| fuel detail reverse hop (the fuel row shows its bank line) | both-way link, Law §9 | CC-3 |
| `pages/banking/ReconciliationWorkspace.tsx`, `BankingTransactionsDesignView.tsx`, `BankAccountDetail.tsx`, `BankingPlaidConnectionsPanel.tsx`, `api/banking.ts`, `api/accounting.ts` | show a fuel match | shared (frontend) |

## 3 — Data, after the code lands (preview first, existing paths only)

- **33 Relay lines with a statement twin**: match each to its canonical fuel row through the match accept
  path (sets `matched_fuel_transaction_id`, posts nothing), clearing the dead `matched_journal_entry_id`
  through the existing unmatch path.
- **43 Relay lines with no twin**: categorize through `banking/categorization.routes.ts` (posts once) and, in
  the same transaction, reverse the fuel row the feed created (POSTING-04 / REVERSAL-ENGINE-02). One without
  the other either doubles or drops the cost.

## 4 — Guards (red-before-green, shrink-only baselines)

1. `review_state='matched'` must have at least one pointer whose target is live (not voided, reversed or
   archived). Today: **76 fail** — baseline 76, target 0. This is what catches a register that says
   "reconciled" with nothing behind it.
2. The new FK exists, and every `matched_fuel_transaction_id` resolves to a live, same-company fuel row.
