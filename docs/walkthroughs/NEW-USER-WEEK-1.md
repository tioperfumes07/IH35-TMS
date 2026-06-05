# New User — Week 1 Walkthrough

By now you've completed [Day 1](./NEW-USER-DAY-1.md) and explored the product with
sample data. Week 1 is about replacing tutorial data with real operations.

## 1. Connect real data sources

1. **QuickBooks Online** — confirm the connection is healthy in Accounting. Run an
   initial sync so your real Chart of Accounts, customers, and vendors pull in.
2. **Samsara** — verify the fleet inventory pulled in matches your real trucks.
   Reconcile any vehicles that need manual linking.
3. **Plaid** — confirm all operating bank + credit-card accounts are linked and the
   first transaction sync has completed.

## 2. Book your first real load

1. Create your real customer in **Customers** (or confirm it synced from QBO).
2. Go to **Dispatch → Book load**.
3. Enter pickup + delivery stops, rate, and assign a real driver + truck.
4. Save. The load gets a real load number (e.g. `L-YYYYMMDD-NNNN`).

## 3. Run your first settlement

1. As the load progresses to **delivered**, generate the driver settlement.
2. Review pay lines, deductions, and escrow.
3. Approve and release the settlement; the driver is notified.

## 4. Run your first bank reconciliation

1. Go to **Banking → Reconciliation**.
2. Select the bank account and statement period.
3. Match imported Plaid transactions to loads, bills, and settlements.
4. Resolve any variances (timing, fees), then sign off and lock the period.

## 5. Remove sample data

Once your real records exist, remove the flagged sample rows
(`Sample Customer Inc`, `Sample Vendor Co`, `John Tester`, `TEST-001`,
`LD-SAMPLE-001`) from admin tools so reports reflect only real operations.

## Where to go next

- Operator runbooks under **Help → Runbooks** cover recurring monthly workflows
  (close-of-month, IFTA filing, payroll, collections, and more).
- Revisit any onboarding step from settings if integrations need reconnecting.
