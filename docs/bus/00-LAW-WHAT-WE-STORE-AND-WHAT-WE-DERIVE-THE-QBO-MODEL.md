# LAW — WHAT WE STORE AND WHAT WE DERIVE. THE QUICKBOOKS MODEL, AND THE TEN COLUMNS THAT BREAK IT.

Owner: *"WHY DID YOU BUILD A SECOND SYSTEM ON TOP OF IT... WHICH PARTS, WHAT IS THE SECOND PART... REDESIGN
ENGINES SO THEY FUNCTION AS QUICKBOOKS... I DON'T WANT PATCHES, I WANT TO POST IN THE CORRECT MANNER THE
FIRST TIME."*

## WHY IT HAPPENED — THE HONEST ANSWER
I do not know who added these columns or when, and I am not going to invent a reason. What the evidence
shows is this: **they are the shape a TMS uses, not the shape QuickBooks uses.** McLeod and Alvys do carry
driver subledgers with stored running balances — that is normal in trucking software. We are building a
TMS whose accounting engine is a **QuickBooks clone**, and nobody ever wrote down which model wins when
the two collide. So both got built, in the same database, for the same numbers.

**That is a governance failure, and it is mine.** The engine audit the owner asked for was supposed to
catch exactly this before the engines were used. It did not, and he found it himself by asking a question.
This file is the rule that stops it happening again.

## THE RULE — FIVE CASES, AND EVERY NUMBER IN THE SYSTEM IS ONE OF THEM
1. **The balance of a GL account → ALWAYS DERIVED. Never stored.** Driver escrow, vendor balance, driver
   advances, factoring reserve, any account balance. QuickBooks stores none of these; it sums the
   postings. Detail per driver / per vendor lives as **sub-accounts**, each derived from its own postings.
2. **A number on a document → STORED, because it IS the document.** Invoice line total, bill total, the
   contracted line-haul rate. It is what the paper says, not a running total.
3. **A point-in-time record → STORED and IMMUTABLE.** A closed reconciliation's statement balance, a bank
   tie-out, a driver's escrow balance at separation. QuickBooks stores these too. Written once, never
   updated, never recomputed.
4. **A forward schedule → STORED, because it is a plan, not a history.** Amortization, depreciation,
   lease schedules, the daily factoring-interest accrual (compounding needs the prior day's close).
   QuickBooks stores schedules as well.
5. **A number from outside → STORED, labelled as theirs, NEVER used as the book balance.** The bank feed's
   balance from Plaid, the QBO mirror tables. Ours must never read these as truth.

**If a number is case 1, deriving it is not an optimisation — it is the only correct implementation.**

## THE SWEEP — EVERY STORED TOTAL IN THE DATABASE, CLASSIFIED
Swept every bigint/integer/numeric column named like a balance, total, accrual or remaining, across the
money schemas.

### BREAKS THE LAW — case 1 stored instead of derived. **THIS IS THE SECOND SYSTEM.**
    accounting.escrow_accounts            balance_cents                    duplicates 2100-00-nnn  DRIFTED
    driver_finance.escrow_balances        current_balance_cents            duplicates 2100-00-nnn  DRIFTED
    driver_finance.escrow_balances        total_held_cents
    driver_finance.escrow_balances        total_released_cents
    driver_finance.escrow_ledger          running_balance_cents            a register computes this on read
    accounting.vendor_balances            balance_cents        0 triggers  duplicates A/P control
    driver_finance.driver_advances        outstanding_balance              duplicates 1245
    driver_finance.driver_liabilities     current_balance                  duplicates its liability account
    driver_finance.driver_deduction_buckets        remaining_balance_cents
    driver_finance.driver_settlement_deductions    remaining_balance_cents
    accounting.faro_reserve_entries       running_balance_cents            duplicates 1230
    accounting.faro_reserve_entries       short_pay_balance_cents

**Twelve columns across seven tables.** Every one is an account balance the general ledger already
defines. The escrow pair is **proven drifted today**; the others are the same construction and have not
been checked, which is its own answer.

`accounting.vendor_balances` has **zero triggers** — nothing in the database maintains it at all.

### OBEYS THE LAW — leave these alone, they are correct
    case 2  invoice_lines.line_total_cents · factoring_advances.invoice_total_cents · loads.rate_total_cents
            (the owner already ruled line haul is a CONTRACTED TOTAL, not qty x rate)
    case 3  reconciliation_sessions.* · bank_account_tieouts.* · reconciliation_drift_alerts.* ·
            driver_escrow_separations.escrow_balance_at_separation_cents ·
            driver_deduction_bucket_events.balance_after_cents (an event log line, written once)
    case 4  prepaid_amortization_rows · related_party_loan_schedule · lease_schedule_period ·
            revenue_recognition_rows · factoring_default_interest_accruals.opening/closing_balance_cents
    case 5  bank_accounts.current_balance_cents / available_balance_cents (Plaid's number, not ours) ·
            mdata.qbo_ap_bills / qbo_ar_invoices / qbo_vendor_credits .balance_cents (QuickBooks' own)
    already correct  factoring.v_factor_reserve_balance — it is a VIEW. This is what the others should be.

**Do not "fix" anything in this second list.** QuickBooks stores these too. A sweep that flattens
everything is as wrong as the duplication.

## THE REDESIGN — NOT A PATCH, AND NOT ALL AT ONCE
For each of the twelve, in this order, one table per PR:
1. **Name the GL account that already holds the number** — the sub-account or control account.
2. **Replace the column with a view** over the postings of that account. If a physical column must stay
   for read speed, it is a **cache**: rewritten in the **same transaction** as the posting, on INSERT,
   **UPDATE and DELETE**, and never written by anything else.
3. **Guard `verify-<name>-equals-its-gl`** — stored (if any) = the GL account balance, and the row count
   matches the live sub-account count. Ceiling **0**, baseline committed, run unscoped.
4. **Repair nothing by hand.** Every one of these rows is purge population. Fix the writer; the zero-reset
   clears the drift. **Fix writers, not rows.**
5. Report **per table**, against the ten points, with the live query pasted.

**Order — the owner's money first:** escrow (both tables + the ledger's running column) → driver advances
and liabilities → the two deduction remaining-balances → faro reserve → vendor_balances last, since
nothing maintains it today and it cannot have drifted from a value it never had.

## THE PERMANENT ENTRY
**We are a QuickBooks clone in the accounting engine. A number QuickBooks derives, we derive.** Operational
detail QuickBooks does not carry — per-load, per-unit, per-driver, per-trailer — lives as **columns on the
transaction** and as **sub-accounts**, never as a parallel running total. A stored running total is a
second source of truth, and a second source of truth is a future disagreement.

Any new table carrying a case-1 number is refused at review. This goes in the closed register.
