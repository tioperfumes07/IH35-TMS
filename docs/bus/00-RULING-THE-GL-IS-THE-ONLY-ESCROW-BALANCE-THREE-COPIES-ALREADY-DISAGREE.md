# RULING — THE GL IS THE ONLY ESCROW BALANCE. WE BUILT THREE COPIES AND THEY ALREADY DISAGREE.

Owner: *"THEN WHY ARE WE NOT FOLLOWING QUICKBOOKS ON THE ESCROW FORMAT. AREN'T WE SUPPOSED TO BE MIMICKING
QUICKBOOKS IN THE ACCOUNTING ENGINE?"*

**We are — and then we built two more systems on top of it.** That is the honest answer, and the drift is
already live.

## MEASURED ON PROD, RIGHT NOW

    GL sub-accounts 2100-00-nnn  (the QuickBooks way)        28 accounts    1,325.00
    accounting.escrow_accounts.balance_cents  (stored)       44 rows        2,375.00
    driver_finance.escrow_balances.current_balance_cents     18 rows        2,375.00

**The ledger says one number. Two stored tables say another. They are out by 1,050.00 today.**

The two caches agree with each other and disagree with the ledger — the signature of a cache that was
written once and never reversed. **1,050.00 is load 13515's reversal**, done correctly on 10-01 under
AUTH-201. The GL came down. The stored balances did not, because
`accounting.apply_escrow_posting_delta` is **AFTER INSERT ONLY** — no UPDATE handler, no DELETE handler.
Nothing can ever bring those numbers down.

And the row counts disagree too: 28 live GL sub-accounts, 44 escrow_accounts, 18 escrow_balances. Three
systems that do not even agree on how many drivers have escrow.

## WHAT QUICKBOOKS ACTUALLY DOES, AND WHAT WE ALREADY HAVE
QuickBooks stores **no** account balance anywhere. Every balance — escrow included — is derived from the
transactions each time it is shown. For per-driver escrow detail, the QuickBooks answer is **sub-accounts
under one parent liability account**, each sub-account's balance derived from its own postings.

**We already have exactly that:** `2100 Driver Escrow – Held in Trust` with `2100-00-nnn` per driver, live
and posting. That part is correct QuickBooks parity and it is not what is broken.

What is broken is that we then built `accounting.escrow_accounts.balance_cents` and
`driver_finance.escrow_balances.current_balance_cents` alongside it. **QuickBooks has no equivalent of
either.** They were never ruled, never justified in writing, and never reconciled to the ledger. They are
a second and third source of truth for a number that already had one.

## THE RULING — AND IT IS MINE, NOT A QUESTION FOR THE OWNER
**The general ledger is the only escrow balance. Full stop.**

1. **`2100-00-nnn` is the single source of truth.** A driver's escrow is the balance of his sub-account,
   derived from its postings, exactly as QuickBooks does it.
2. **`escrow_balances` and `escrow_accounts.balance_cents` stop being stored numbers.** Either replace each
   with a **view** over the postings, or keep the column strictly as a cache that is rewritten in the
   **same transaction** as the posting on INSERT, UPDATE **and** DELETE.
3. **Guard `verify-escrow-balance-equals-its-gl-subaccount`** — for every driver, stored (if any) **=** the
   GL sub-account balance, and the escrow row count **=** the live sub-account count. Ceiling **0**,
   baseline committed, run unscoped.
4. **The 1,050.00 is not repaired by hand.** It is purge population; the zero-reset clears all three. Fix
   the trigger so it cannot come back. **Fix writers, not rows.**
5. **Decision 2 is dissolved and does not go back to the owner.** Once the balance follows its postings,
   deleting the postings takes it to zero by itself. The purge needs no special escrow handling.

## THE GENERAL LAW THIS SETTLES, SO IT IS NEVER RE-ARGUED
**We are a QuickBooks clone in the accounting engine. A number that QuickBooks derives, we derive.**
We do not store a balance that the ledger already defines. Where we need detail QuickBooks does not carry
— per-load, per-unit, per-driver operational attribution — that lives as **columns on the transaction**
and as **sub-accounts**, never as a parallel running total.

A stored running total is a second source of truth, and a second source of truth is a future disagreement.
We have one on the board today, in money, and it took an owner's question to surface it.

## THE SWEEP — §9.0.17, CC-3, AND THIS IS NOW URGENT
Every stored running total maintained by an append-only writer is this same defect. Escrow had it in two
tables. **Find all of them before the owner re-enters data** — wallets, driver advances, factoring
reserves, driver liabilities, parts inventory, fuel wallets, any `*_balance*` or `*_total*` column.
For each: name the table, the column, the trigger or service that maintains it, and whether it handles
UPDATE and DELETE. **List first, fix second.** Report the list in the bus today.
