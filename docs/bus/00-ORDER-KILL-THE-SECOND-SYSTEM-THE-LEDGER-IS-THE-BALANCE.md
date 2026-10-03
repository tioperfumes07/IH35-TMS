# ORDER — KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE. POLICIES AND RULES STAY.

Owner, 2026-10-03: *"THEN LETS STOP THE SECOND THING FROM EXISTING. YES POLICIES RULES ETC NOT DELETE.
USMCA IS NOT IN CH 11, SO IT DOES NOT APPLY HERE AT ALL. LETS GET THE ENGINE AND SPINE FIXED CORRECTLY."*

**CORRECTION ON THE RECORD:** I referenced a Chapter 11 escrow requirement in the context of USMCA. That
was wrong — **USMCA is not in Chapter 11 and it does not apply here at all.** Struck. Nobody carries it
into a design decision.

## THE SHAPE OF THE WORK — IT IS A DELETION, NOT A BUILD
The QuickBooks format is **already live and already correct**: `2100 Driver Escrow – Held in Trust` with
`2100-00-nnn` per driver, and `1245 Driver Cash Advances Receivable` with a sub-account per driver, both
auto-provisioned on hire. Measured: 27 live drivers, 28 live escrow sub-accounts, 28 live advance
sub-accounts.

Nothing has to be built to "work like QuickBooks." **The second system has to stop existing**, and every
screen has to read the account.

## THE RULE THAT DECIDES WHAT DIES AND WHAT STAYS
- **A BALANCE is DERIVED.** "This driver has X in escrow" = the sum of his sub-account's postings. Never
  stored, never cached without a guard.
- **A POLICY, RULE, PLAN or DOCUMENT is STORED.** "Deduct $25 a settlement until the $2,500 cap." "He owes
  $3,000 for damage, $250 a settlement." "This advance was approved on this date for this reason." Those
  are records of intent and of events. **They stay. Nothing in this order deletes a policy or a document.**

The test: *could a CPA recompute this number from the postings?* If yes, it must be derived. If it is a
decision someone made, it is stored.

## THE TWELVE — WHAT DIES, WHAT STAYS, WHICH ACCOUNT OWNS THE NUMBER

    COLUMN THAT DIES                                          GL ACCOUNT THAT OWNS IT   WHAT STAYS
    accounting.escrow_accounts.balance_cents                  2100-00-nnn               the driver<->account mapping row
    driver_finance.escrow_balances.current_balance_cents      2100-00-nnn               nothing — becomes a view
    driver_finance.escrow_balances.total_held_cents           2100-00-nnn               (derived: sum of deposits)
    driver_finance.escrow_balances.total_released_cents       2100-00-nnn               (derived: sum of releases)
    driver_finance.escrow_ledger.running_balance_cents        2100-00-nnn               THE LEDGER ROWS — they are the detail
    accounting.vendor_balances.balance_cents                  A/P control per vendor    nothing — becomes a view
    driver_finance.driver_advances.outstanding_balance        1245 / sub-account        THE ADVANCE DOCUMENT: date, amount,
                                                                                        reason, who approved it
    driver_finance.driver_liabilities.current_balance         its liability account     THE LIABILITY RECORD: what it is, terms
    driver_finance.driver_deduction_buckets.remaining_balance 1245 / its account        THE POLICY: per-settlement amount, cap,
                                                                                        reason, may_draw_escrow
    driver_finance.driver_settlement_deductions.remaining_bal same                      THE DEDUCTION LINE on the settlement
    accounting.faro_reserve_entries.running_balance_cents     1230 Factoring Reserves   THE RESERVE MOVEMENT rows
    accounting.faro_reserve_entries.short_pay_balance_cents   1230 Factoring Reserves   the short-pay event + its credit memo

**Read that column on the right before you touch anything.** Every row of intent survives. Only the
running totals go.

## HOW — ONE TABLE PER PR, IN THIS ORDER
1. **Name the account.** State in the PR body which GL account (or sub-account family) owns the number.
2. **Repoint the readers FIRST.** Every screen, report, API and service that reads the stored column now
   reads the account balance. Ship this and prove the screen still shows the right number — **before**
   the column goes. No screen may ever read both.
3. **Replace the column with a view** over the postings of that account. If a physical column must stay
   for read speed, it is a **cache**: written in the **same transaction** as the posting, on INSERT,
   **UPDATE and DELETE**, by nothing else, ever.
4. **Guard `verify-<name>-equals-its-gl`** — stored or derived value **=** the GL account balance, per
   driver / per vendor, and the row count matches the live sub-account count. Ceiling **0**, baseline
   **committed**, run **unscoped** (a company filter cannot see a row that escaped its company).
5. **Repair nothing by hand.** Every drifted row is purge population. Fix the writer; the zero-reset
   clears the drift. **Fix writers, not rows.**
6. Report **per table** against the ten points with the live query pasted.

## ORDER OF WORK — THE OWNER'S MONEY FIRST
    CC-1   escrow: escrow_accounts + escrow_balances + escrow_ledger.running_balance   <- START HERE
    CC-1   driver_advances.outstanding_balance · driver_liabilities.current_balance
    CC-2   driver_deduction_buckets · driver_settlement_deductions  (KEEP the policy, derive the remaining)
    CC-2   faro_reserve_entries x2
    CC-3   vendor_balances — LAST. Zero triggers maintain it today, so it cannot have drifted from a
           value it never had. Confirm that before touching it.

## AND THE SPINE, SO THE TWO HALVES MEET
A derived balance answers *how much*. The spine answers *where it came from*. Together they are the whole
engine, and both are now enforced in the database:
- `trg_live_posting_keeps_spine_link` — a live posting can never lose its last `transaction_source_links`
  row. Already on prod.
- Every balance on every screen traces: **screen → GL account → postings → spine link → source document.**
  No number anywhere may be reachable by any other path.

**When a seat finishes a table, the test is this:** click the number on the screen, drill to the account,
drill to the postings, drill to the document. If the chain breaks, it is not done. If the number came from
a column instead of the chain, it is not done.

## THE PERMANENT ENTRY — CLOSED REGISTER
**A number QuickBooks derives, we derive.** Per-driver and per-vendor detail lives in **sub-accounts**,
auto-provisioned, exactly as the owner described. Operational detail QuickBooks does not carry — load,
unit, driver, trailer — lives as **columns on the transaction**. **No parallel running totals, ever.**
A new table carrying an account balance is refused at review.
