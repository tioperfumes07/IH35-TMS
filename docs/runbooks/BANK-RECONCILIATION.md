# Runbook — Bank Reconciliation

**Owner:** Accounting
**Frequency:** Daily review + monthly close reconciliation
**Systems:** IH35 TMS (Banking), Plaid, QuickBooks Online

Keep bank/credit-card activity categorized, matched, and reconciled to the books.

## Daily

1. **Verify the Plaid sync.** Banking → confirm each connected account synced today
   (badge shows recent sync). Reconnect any account showing `needs_reauth`.
2. **Categorize uncategorized transactions.** Banking → Transactions (for-review);
   apply auto-categorization rules and manually categorize the rest to the correct
   GL account, vendor, or customer.
3. **Mark transfers** between accounts so they don't double-count as income/expense.

## Monthly (close reconciliation)

4. **Start a reconciliation session.** Banking → Reconciliation; select account,
   statement period, and statement ending balance.
5. **Match transactions** to loads, bills, settlements, and journal entries using
   the worklist/auto-match candidates.
6. **Reconcile differences** — timing items, bank fees, interest. Post any missing
   fee/interest JE.
7. **Confirm variance = 0** (or document an accepted variance with reason).
8. **Sign off + lock the period** for that account.

## Verification

- [ ] All accounts synced (no `needs_reauth`).
- [ ] Uncategorized queue = 0.
- [ ] Transfers flagged (not counted as P&L).
- [ ] Reconciliation variance = 0 or documented.
- [ ] Period signed off + locked.

## Escalation

If a reconciliation variance cannot be explained, do not force-complete — escalate
to the Owner and investigate before locking.
