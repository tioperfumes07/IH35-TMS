# Runbook — Close of Month

**Owner:** Accounting / Owner
**Frequency:** Monthly (first 5 business days after period end)
**Systems:** IH35 TMS (Accounting, Banking, Reports), QuickBooks Online

Close out the prior accounting period with reconciled books, reviewed aging,
and locked financial statements.

## Prerequisites

- All loads for the period delivered/invoiced where applicable.
- Bank feeds (Plaid) synced through the last day of the period.
- QBO connection healthy.

## Steps

1. **Confirm all bills entered for the period.** In Accounting → Bills, filter by
   the period and confirm fuel, maintenance, insurance, and vendor bills are posted.
2. **Confirm all driver settlements posted.** Drivers → Settlements; verify the
   period's settlements are finalized.
3. **Reconcile all bank accounts to QBO.** Banking → Reconciliation: for each
   account, match the statement period and resolve all transactions (see
   [BANK-RECONCILIATION.md](./BANK-RECONCILIATION.md)).
4. **Run AR aging + collections triage.** Reports → AR Aging; bucket overdue
   invoices and trigger collections actions (see [COLLECTIONS-WORKFLOW.md](./COLLECTIONS-WORKFLOW.md)).
5. **Run AP aging.** Reports → AP Aging; confirm nothing is unexpectedly overdue.
6. **Run depreciation entries** (if applicable) for owned units.
7. **Run AdValorem accruals** for the period.
8. **Review uncategorized transactions = 0.** Banking → Transactions; ensure the
   for-review queue is empty.
9. **Generate P&L.** Reports → Profit & Loss for the period; review for anomalies.
10. **Generate Balance Sheet.** Reports → Balance Sheet; confirm it balances.
11. **Generate Cash Flow Statement.** Reports → Cash Flow.
12. **Owner review + sign-off** on the three statements.
13. **Lock the period.** Apply the BS/TB/CF basis lock per Block-20 period-lock
    controls so prior-period entries cannot change.
14. **Distribute reports** to stakeholders (email/export).
15. **Archive** the month-end package (PDF exports) to Docs.

## Verification

- [ ] Bank reconciliations signed off for every account.
- [ ] Uncategorized transaction count = 0.
- [ ] P&L, Balance Sheet, Cash Flow generated and reviewed.
- [ ] Period locked; sign-off recorded.

## Escalation

If the Balance Sheet does not balance or a reconciliation variance cannot be
resolved, stop and escalate to the Owner before locking the period.
