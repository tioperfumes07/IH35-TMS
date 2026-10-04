<!-- Lead ruling ROUND 394 to CC-1, as received 2026-10-04 (verbatim). Filed so the lane guard can cite it: RULING 1 directs the pay-run close (CC-3-owned settlement-payrun-close.service.ts) and advance creation to the driver's own 1245 sub-account. -->

CC-1 — ROUND 394 — RULING: tables 6–7. Your recommendation governs. The 10-02 ruling is superseded.

YOUR CONFLICT, RESOLVED. Production decides it, not the older ruling.

MEASURED LIVE (USMCA, bypass_rls='lucia', DIRECT endpoint, 2026-10-04):
  2000 Accounts Payable = $3,542.98 credit, and ALL of it is 3 bill lines ($566.35) plus 60 lines
       typed journal_entry with no bill ($2,976.63). There is NO driver A/P bill in this entity.
  2170 Driver Net-Pay Clearing = $71,215.96 credit. The driver payable lives THERE, not in A/P.

So the 10-02 ruling — "a cash advance is a bill payment on the driver's A/P bill" — describes a bill
that does not exist. It is SUPERSEDED. A driver advance is money the driver OWES THE COMPANY: a
receivable, not a reduction of payables. That is also how QuickBooks treats an employee or contractor
advance. 1245 Driver Cash Advances Receivable already exists and the settlement bill-payment path
already uses the driver's own sub-account.

RULING 1 — ADVANCES. Build your recommendation.
  - Disbursement DEBITS the driver's own 1245 sub-account. No shared cash_advance account.
  - Pay-run close CREDITS the same driver's 1245 sub-account. No shared advance_recovery account.
  - Resolve the sub-account through the role table, never by number (365.1).
  - THEN drop outstanding_balance. Not before: migrate the six live readers (pay-run recovery amount,
    fuel-advance open check, the two reversal guards, the dispatch debt warning, the cash-advance
    tabs) to the derived balance in the same PR, and prove each reads the same number it read before.
  - USMCA nets to $0 today (10 recovered, 2 reversed), so there is nothing to correct — only to
    repoint before the purge re-creates everything.

RULING 2 — THE THREE LIABILITY TYPES. They are DRIVER RECEIVABLES, not liabilities: the driver owes
the company. They sit beside 1245 and 1250, and each gets its own account so a settlement deduction
can say what it is:
  1255  Driver Damage Receivable
  1256  Driver Fine Receivable
  1257  Driver Negative Settlement Receivable
All three: account_type Asset, postable, bound through the role table as driver_damage_receivable,
driver_fine_receivable, driver_negative_settlement_receivable. Create them the way migration
202615400930 creates 5015 — resolve the company by code, idempotent, no hardcoded UUID.

Today damage, fines and negative settlements create NO GL entry at all, and mark-paid-off and void
zero the stored balance with no entry. That is the real defect: money owed by a driver that the
general ledger has never heard of. Each of the three posts on creation (debit the receivable, credit
the matching income or expense-recovery account), is recovered through settlement (credit the
receivable), and is written off only by a reversing entry — never by zeroing a stored number.

ORDER: accounts and roles first, then the posting paths, then drop the stored copies. One PR each is
fine; do not drop a stored balance before its readers are derived and proven.

DEADLINE: 2026-10-06 18:00Z. Missed -> CC-3.

THE PURGE AUTHORIZATION YOU ARE WAITING ON IS THE OWNER'S, NOT MINE. The four E2E rows are listed in
your own report; he has it.
