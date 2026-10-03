# ALL SEATS — ROUND 352 — The five pre-purge findings, assigned. And the DEEP table-completeness contract.

**Owner order:** *"HAVE CODERS FIX ALL, AND CONTINUE WITH THE ENGINE AUDITS AND FIXES NOW, DEEP, NOT SURFACE. SO WE CAN GET THIS DONE NOW. I WANT ALL THE TABLES FULLY DONE AND COMPLETE SO WE CAN BEGIN."*

The pre-purge audit is done. **The ledger balances exactly: $2,178,029.25 debits = $2,178,029.25 credits, difference $0.00, 7,909 postings, voided entries excluded.** Baseline captured in `claude/audits/10-03-2026-PRE-PURGE-AUDIT-BASELINE-TRIAL-BALANCE-AND-TABLE-COUNTS.xlsx`. Every figure in it must read 0.00 after the purge.

Five findings came out of it. **Three of them are the same defect wearing three faces — one side of an entry posting without its pair — and all three will rebuild themselves the moment the owner re-enters, unless the writer is fixed first.** That is why they go ahead of the purge, not after.

---

## F-1 — THREE DRIVER ESCROW ACCOUNTS ARE OVERDRAWN → **CC-1**

    2100-00-002  Neftali Coronado Urbano        +$ 50.00
    2100-00-004  Rafael Rogelio Rivero Reynoso  +$ 25.00
    2100-00-027  Jorge Luis Infante Corona      +$150.00
                                                 $225.00

Liability accounts carrying a **debit** balance. Escrow is money held **for** the driver — a debit balance means **we released more than we ever held.** The engine permitted a release larger than the balance.

**The purge zeroes these and the evidence disappears.** So the fix is the writer, not the rows:

- `driver_finance.escrow_ledger` release path must **refuse** a release whose amount exceeds `escrow_balances.current_balance_cents` for that driver and company. Refuse in the **database**, not only in the service — a trigger or a CHECK, so an import or a direct call cannot route around it.
- `current_balance_cents` must never go negative, and `total_released_cents` must never exceed `total_held_cents`. Both as constraints.
- Guard `verify-escrow-never-over-releases` — zero drivers whose released exceeds held, zero negative balances, zero liability sub-accounts with a debit balance. **Debt ceiling 0**; this is a new guard with no legacy debt to baseline.

Paste the refusal from a fork attempt, and the three accounts' before and after.

## F-2 — UNDEPOSITED FUNDS IS NEGATIVE $151,736.34 → **CC-2**

    1090 Undeposited Funds, an ASSET, carrying a credit balance
    440 lines · debits $124,234.88 · credits $275,971.22 · net -$151,736.34

A holding account where money sits between receipt and deposit **cannot be negative in reality.** More was swept out than ever landed. Either the deposit side posts without the receipt side, or it posts twice.

Find which. Then: `1090` must never hold a credit balance — constrain it, and guard it. Same shape as F-1: refuse the unpaired posting at the database, not in one service.

## F-3 — RELAY FUEL WALLET IS NEGATIVE $33,839.80 → **CC-2**

    1295 Relay Fuel Wallet, an ASSET, carrying a credit balance
    128 lines · debits $2,228.17 · credits $36,067.97 · net -$33,839.80

A **prepaid** wallet cannot hold negative cash. The spend posts without the funding. `1295` is also one of the accounts with **no declared role** — nothing in `accounting.chart_of_accounts_roles` says what it is for, which is precisely how it drifted this far without anyone seeing it.

Two parts, one PR: declare the role (`fuel_wallet_relay`) and repoint the Relay ingest at `resolveRoleAccount`; then constrain `1295` against a credit balance. Report what the funding path is and why it is not posting.

**F-1, F-2 and F-3 are one family: an entry posting one leg.** Whoever finishes first writes up the shape and the other two reuse it. Do not build three different guards for one defect — §9.0.17.

## F-4 — DRIVER PAY IN TWO ACCOUNTS → **RULED. 6890 is canonical.** → **CC-1**

    5100 Driver Pay / Settlements        23 lines   $ 1,190.00   ZERO credits, ever
    6890 Cost of Labor–Mexico Drivers   235 lines   $74,170.94   carries role driver_pay_expense

**6890 is canonical and the ruling is mine, not a question for the owner.** It carries 98% of the money, it is the account the declared role already points at, and 5100 has never been credited once — a cost account that only ever receives debits is not in use, it is being written to by one stray path.

Find the path writing to 5100, repoint it at the role, retire 5100 or give it a stated distinct purpose in writing. After the purge both read zero, so **this must be fixed before re-entry or the owner will type into the split.**

## F-5 — ASK MY ACCOUNTANT HOLDS $2,976.63 → **CC-1, already ordered in ROUND 339 Order 5**

188 lines. Every one is an engine that could not classify and parked instead of refusing. **They clear with the purge — do not touch the rows.** Change the engine so it throws. `checkAskMyAccountantForCompany` exists; wire it as a guard, not a report.

---

# THE DEEP PART — the table-completeness contract

"Fully done and complete" needs a definition that can be measured, or every seat will report done against a different standard. **This is the definition. Nine points. A table is not complete until every one is true, and "it looks fine" is not one of them.**

For every table that carries money or a company:

1. **`operating_company_id` NOT NULL.** No `tenant_id`. The ROUND 342 event trigger refuses the column outright now.
2. **Every unique index contains `operating_company_id`**, or is the table's own surrogate primary key, or is allow-listed **with the reason written in the guard file.** 183 business-key unique indexes were missing it; 39 are true defects.
3. **Every parent reference is enforced, and enforced through NULL.** A composite same-entity FK is MATCH SIMPLE — **a NULL in either column switches it off for that row.** That is how 28 bill lines came to reference a bill that does not exist. A single-column FK on the parent, or MATCH FULL, or the NOT NULL that arms it. Pick one per table and say which.
4. **Both ways on the spine.** Every writer of `journal_entry_postings` calls `writeTransactionSourceLink` in the same transaction. Not a separate call, not a later job.
5. **WORM.** No financial row deletes except through the governed purge. 80 triggers back `refuse_financial_row_delete` today.
6. **Idempotent.** A trace key or idempotency key, and a retry creates nothing new. Prove it by running the path twice on a fork.
7. **Reversible.** The document can be voided, the GL reversed with a linked reversal, and the reversal itself traceable. `reverseJournalEntryNoFlip` — the original is never flipped.
8. **Single-fire.** Every scheduled engine wrapped in `withJobLease`. `numInstances=2` means an unwrapped tick fires twice and pays twice.
9. **One named guard, ratcheted, shrink-only, every debt entry named with a reason.** A baseline the guard writes for itself and gitignores **is not a ratchet** — commit it or replace the measure. That ruling stands for both seats who hit it.

**Report per table, not per PR.** A table with eight of nine is not done, and the one missing point is the one that will bite the owner's fresh data.

## WHERE TO START — the money path the owner is about to re-enter, in order

The owner re-enters through the **Settlement Creator**. So the tables that receive his typing come first, and nothing else matters until these nine points are true on all of them:

    driver_finance.driver_settlements · settlement_lines · driver_bills
    driver_finance.driver_settlement_deductions · escrow_ledger · escrow_balances
    accounting.expenses · expense_lines
    accounting.bills · bill_lines · bill_payments
    accounting.invoices · invoice_lines
    accounting.journal_entries · journal_entry_postings · transaction_source_links
    accounting.payments · payment_applications

Then the feeds that attach to them: `banking.bank_transactions`, `fuel.fuel_transactions`.

Then everything else, descending by money touched.

## THE TWO GAPS THAT MUST BE RULED BEFORE THE OWNER TYPES

From the landing contract (`claude/audits/10-03-2026-LANDING-CONTRACT-STAMPS-TABLES-AND-PURGE-SCOPE.xlsx`), measured on 244 settlement-born expenses:

    class_id               0 / 244    stamped on ZERO expenses
    location_id            0 / 244    stamped on ZERO expenses
    line_category          4 / 252    on the lines
    expense_category_uuid  0 / 252    on the lines

**If QuickBooks reporting needs a class on an expense, every expense the owner is about to type will be missing it and we will have rebuilt the defect by hand.** Either the engine stamps them — and they go to the contract as MUST BE 100% — or we do not use them and they are allow-listed **in writing, with the reason**. Whoever owns the QBO push answers this first, today, before re-entry begins.

## THE GATE ORDER — nothing deletes until all five are green

1. CC-1's entity-column rename on prod (ROUND 350, approved, push authorised).
2. The 5 real USMCA invoices posted — **$20,800.00** — through the posting engine. You cannot capture a trial-balance baseline that is understated; every future "the purge was clean" proof would inherit the error.
3. `verify-universal-reinstate-engine` AUTH-113 fixed. The reopen path must be whole before anything irreversible, and the hole is on the factoring family — the one carrying real cash.
4. **F-1, F-2, F-3 writers fixed.** These three rebuild themselves on re-entry otherwise.
5. `verify-trial-balance-unchanged-across-purge --capture pre-delete`.

Then the purge, through `cascade-void-engine.service.ts` and the governed executors, under the owner's AUTH. **Reverse the GL → void the document → purge the row. Never a hand-written DELETE.** Then `--compare`. Then the 21 orphan guards wired into CI.

## THE RULE FOR EVERY SEAT TONIGHT

**Fix writers, not rows.** Every row in this database is about to be deleted. A guard that stops a bad row is worth more than a thousand rows cleaned, because the thousand are going anyway and the guard is what protects what the owner types next.

**Nobody seeds, feeds, or demo-loads anything into USMCA, for any reason, including proof.** The owner feeds it. That is the entire point of the purge.
