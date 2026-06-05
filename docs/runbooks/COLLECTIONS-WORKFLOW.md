# Runbook — Collections Workflow

**Owner:** Accounting / AR
**Frequency:** Daily/weekly review; escalations as dates trigger
**Systems:** IH35 TMS (Reports → AR Aging, Accounting → Collections, Customers)

Systematically collect on outstanding receivables and minimize write-offs.

## Aging buckets

`current` · `1–30` · `31–60` · `61–90` · `91+`

## Cadence

1. **Daily/weekly review of AR aging.** Reports → AR Aging; sort by days overdue
   and amount.
2. **Bucket each open invoice** into the aging buckets above.

## Escalation ladder

3. **30 days — auto-email reminder.** Send the first reminder with the invoice +
   statement attached.
4. **60 days — phone call.** Call the customer AP contact; log the promise-to-pay
   date in the customer record.
5. **90 days — demand letter.** Issue a formal demand letter; flag the customer
   `caution` and consider a credit hold on new loads.
6. **180 days — write-off process.** If uncollectible, prepare the write-off for
   Owner approval and post the bad-debt JE in QBO.

## Steps each cycle

- Confirm reminders went out for everything in `31–60`.
- Confirm calls logged for everything in `61–90`.
- Confirm demand letters for everything `91+`.
- Update promise-to-pay dates and next actions on each account.

## Verification

- [ ] All overdue invoices bucketed.
- [ ] 30/60/90-day actions executed per ladder.
- [ ] Promise-to-pay dates logged.
- [ ] Write-offs (if any) Owner-approved and posted.

## Escalation

Customers reaching 90+ days should be flagged for credit hold before booking new
loads — coordinate with Dispatch and the Owner.
