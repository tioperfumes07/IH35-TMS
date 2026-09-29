# DEVIN-B — ROUND 271
# VOID CONTAMINATION AUDIT ACROSS EVERY MODULE — **THEN** THE PURGE
# Issued by Claude Lead · 09-29-2026 · OWNER-ORDERED · SUPERSEDES any earlier purge instruction to Devin-B

## OWNER'S ORDER, VERBATIM

> "DEVIN SHOULD ALSO PERFORM AN AUDIT, BEFORE WE DELETE ALL VOIDS, BECAUSE YOU SAID FARO STILL SHOWS THOSE THAT ARE VOIDED. WELL MAYBE IT SHOULD PERFORM AN AUDIT OF ALL MODULES, WINDOWS, ETC AND MAKE SURE THAT ALL THAT HAVE A VOID, DO NOT HAVE THE SAME DEFECT AS IN FACTORING."

> "THAT IS WHY WE NEED TO DELETE ALL VOIDED TRANSACTIONS FROM THE ENTIRE APP, ALL TEST, SAMPLE, DEMO, EXAMPLE, ETC TYPE TRANSACTIONS, DATA, VENDORS, CUSTOMERS, UNITS, MAINTENANCE, WORK ORDERS, INVOICES, ETC."

**The owner is right and the order of operations matters more than the purge itself.**
If we delete the voided rows first, every rollup that is silently counting voids goes green — and stays broken. The next void the company records puts the wrong number back on the screen, and nobody will know, because the evidence was deleted. **The audit runs first. The fix runs second. The delete runs last.**

---

## PART A — QUICKBOOKS TERMINOLOGY (we all use these words, nothing else)

| Our word | QuickBooks word | What it is |
|---|---|---|
| Expense | Expense | Money out, paid at the moment it is recorded |
| Bill | Bill | Vendor owes-us-later; creates A/P |
| Bill Payment | Bill Payment | Pays a Bill; clears A/P |
| Invoice | Invoice | Customer owes us; creates A/R |
| Receive Payment | Receive Payment | Customer pays; clears A/R |
| Journal Entry | Journal Entry | Direct debit/credit pair |
| Matched / Cleared | Matched | Bank line tied to a ledger document — **STATUS ONLY** |
| Reconciled | Reconciled | Statement closed — **STATUS ONLY** |
| Void | Void | Document killed, number and record retained |
| Delete | Delete | Document removed from the app |

## PART B — THE POSTING RULE (owner-confirmed law, do not relitigate)

A document posts its journal entry **WHEN IT IS RECORDED**, dated the transaction date.
**Matched/Cleared and Reconciled create NO journal entry — they are statuses only.**
Owner: *"if you write a check on Dec 31 but is deposited on January 03, the accountant reports it as a December payment."*

## PART C — THE VOID ENGINE STANDARD (researched, closed, already correct in our app)

NetSuite model, which we already implement and which is superior to QuickBooks' zero-in-place:
- The original document is **left untouched at its full original amount**, flagged Voided.
- A **separate reversing journal entry** is written, **dated the void date**, linked both ways (`Void Of` / `Voided On`).
- **No GL-impacting change is ever made to the original after the fact** — not the amount, not the posting period.

Do not change this. What this round fixes is **who reads voided rows and forgets to exclude them.**

## PART D — ANTI-DRIFT CONTRACT (all 13 apply)

1. Do the thing, live. Not a plan, not a doc about the thing.
2. Never report done without pasted proof — the live row, the live screen, the live query.
3. Never guess. Read the source: signed PDF, live table, bank statement.
4. Empty is a question, not an answer. Check the entity, the filter, the RLS bypass, the join, the spelling.
5. No patching. Fix the root cause in the same session.
6. USMCA only — `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSPORTATION and TRUCKING are frozen.
7. Every USMCA record is REAL unless `is_sample_data = true`. **Never write test/sample/demo rows into USMCA — not even to prove something works.**
8. Canonical tables: write `driver_finance.*` / `mdata.qbo_*` / `banking.*` / `maintenance.*` / `mdata.vendors` / `catalogs.load_cancellation_reasons`. Never `payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`, `catalogs.cancellation_reasons`.
9. Production is Neon `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`. Reads need **both** lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
10. RLS guard work runs on the **pooled** endpoint only, where `current_user` resolves to `ih35_app`. The direct endpoint lies to you.
11. No blocking guard may derive its verdict from wall-clock time.
12. **NOTHING STAYS ON YOUR MACHINE.** If it is complete, you push, merge and deploy. No local-only work at the end of your round.
13. **AUTO-DEPLOY IS OFF.** After merge you trigger the deploy yourself and paste the deploy id.

---

# THE MEASURED STATE — Claude Lead ran this live, 09-29-2026, USMCA production

**124 tables in this database carry void or sample-data columns. 18 of them hold live voided rows — 2,732 rows.**

| Table | Voided rows |
|---|---|
| `accounting.expenses` | 946 |
| `banking.reconciliation_matches` | 641 |
| `banking.bank_transactions` | 563 |
| `fuel.fuel_transactions` | 276 |
| `integrations.relay_fuel_transaction_lines` | 100 |
| `integrations.relay_fuel_transactions` | 76 |
| `accounting.factoring_advances` | 51 |
| `accounting.bill_lines` | 31 |
| `accounting.invoices` | 25 |
| `driver_finance.settlement_lines` | 5 |
| `banking.check_number_registry` | 5 |
| `driver_finance.driver_settlements` | 3 |
| `accounting.bills` | 3 |
| `driver_finance.driver_liabilities` | 2 |
| `driver_finance.driver_bills` | 2 |
| `safety.incidents` | 1 |
| `maintenance.work_orders` | 1 |
| `legal.contract_instances` | 1 |

**Flagged sample data — 59 rows:**
`mdata.units` 17 · `mdata.customers` 16 · `mdata.vendors` 10 · `mdata.drivers` 10 · `mdata.equipment` 5 · `downtime.events` 1

## THE KNOWN DEFECT — the pattern you are hunting

Factoring. `accounting.factoring_advances` holds **93 live advances and 51 voided ones**. The Advanced-MTD figure the app shows counts **106** records — it is summing voided advances into a live liability number. The advance count (93) and the `accounting.invoices` "advanced" flag count (95) also disagree.

**That is the defect. Your job is to find every other place in the app that has it.**

---

# PHASE 1 — THE VOID CONTAMINATION AUDIT (runs before anything is deleted)

For **every one of the 18 tables above**, and for every module, window, list, report, dashboard tile, export and API endpoint that reads them, answer one question:

> **Does this query exclude `voided_at IS NOT NULL` (or `is_void = true`) — and should it?**

Cover, at minimum, every surface these tables feed:

- **Factoring** — advances, MTD advanced, outstanding liability, reserve held, factor fees, the Faro submission queue
- **Accounting** — P&L, Balance Sheet, Trial Balance, A/R aging, A/P aging, GL detail, expense lists, bill lists, invoice lists, cash-flow
- **Banking** — bank register, match queue, unmatched count, reconciliation sessions, drift alerts, check-number registry, statement balances
- **Fuel** — fuel transactions, gallons, fuel spend, MPG, tank inventory, per-load real fuel cost, Relay imports
- **Driver finance** — settlements, settlement lines, driver bills, driver liabilities, advances, escrow, deduction recovery, YTD driver totals
- **Dispatch / loads** — load lists, load counts by status, revenue per load, margin per load
- **Maintenance** — work orders, WO lines, parts purchases, maintenance cost per unit
- **Safety** — incidents, accidents, violations, inspections, the safety scorecard
- **Legal** — contract instances
- **Every KPI tile, every "MTD"/"YTD"/"Total" number anywhere in the app**

### How to report each finding

One row per defect, in a numbered table:

| # | Module / window | File:line or endpoint | Table read | Voids excluded? | Wrong number today | Correct number | Fixed in commit |
|---|---|---|---|---|---|---|---|

Every "wrong number today" and "correct number" must be a **pasted live query result**, not an estimate.

### Do not stop at SQL

Check the **UI layer too**. A backend that returns voids correctly and a React list that renders them anyway is the same defect wearing a different hat. Check views in `views.*` as well — `views.live_loads` carries `voided_at` and is read by the board.

---

# PHASE 2 — FIX IT PERMANENTLY, NOT ONE QUERY AT A TIME

Patching 40 queries one by one guarantees the 41st report written next month has the bug again. Build the exclusion in **one place** and make it impossible to forget:

- A canonical **active-row view or predicate per table** (e.g. `views.v_factoring_advances_active`), used by every read path; or
- A shared query helper/repository layer that applies the predicate by default and requires an explicit opt-in to include voids.

Then add a **CI ratchet** that fails the build when a new query aggregates one of the 18 void-carrying tables without the exclusion. Shrink-only, `REQUIRES_LIVE_DB` (cannot connect = FAIL), and **no wall-clock in the verdict** (Part D item 11).

State the count the ratchet starts at. It may only go down.

---

# PHASE 3 — THE VOID PURGE (only after Phases 1 and 2 are merged and deployed)

Owner's order: permanently delete all voided transactions so they do not appear in the app.

1. **Archive first.** Every row you delete, and every row of every child table you delete, goes into an `archive.*` table with the full original payload, the delete timestamp, the round number, and the reason. This is not optional and it is not a "backup file" — it is a table in the database.
2. Delete **children before parents**, following the real FKs. Do not disable a constraint to make a delete succeed; if an FK blocks you, that linkage is telling you something — resolve it properly.
3. **The reversing journal entries go with their originals.** The void already posted its reversal, and the two entries net to zero. Deleting the original without deleting its reversal creates a one-sided GL. Delete the **pair**, and prove the GL is unchanged: paste Trial Balance totals before and after — they must be **identical to the cent**.
4. Paste before/after row counts for all 18 tables.
5. Paste before/after: Trial Balance, Balance Sheet totals, A/R total, A/P total, cash per bank account, Advanced MTD, outstanding factoring liability. **Every one of these must be unchanged**, because voided rows should never have been contributing in the first place. **If any number moves, stop — that is Phase 1 telling you it missed a contamination point. Go back and fix it.**

---

# PHASE 4 — THE TEST / SAMPLE / DEMO PURGE

1. Delete the **59 rows flagged `is_sample_data = true`**, archive-first, children first, same proof standard.
2. Then scan **by name and pattern** across `mdata.customers`, `mdata.vendors`, `mdata.drivers`, `mdata.units`, `mdata.equipment`, `mdata.loads`, `mdata.locations`, `accounting.invoices`, `accounting.expenses`, `accounting.bills`, `maintenance.work_orders`: `test`, `sample`, `demo`, `example`, `dummy`, `foo`, `bar`, `asdf`, `xxx`, `acme`, `lorem`, `do not use`, `delete me`, placeholder emails, `555-` phone numbers, `00000` addresses.
3. **Do not delete name-matched rows automatically.** Produce the candidate list in one table — id, name, created_at, what it links to, whether it carries money — and hand it to the owner as one batch for a single yes/no. A real customer named "Test Fleet LLC" is a real customer. Flagged rows you delete; name-matched rows the owner clears first.
4. Prove no orphans afterward: every FK in the app still resolves. Paste the orphan check.

---

# PHASE 5 — THE POSTING AUDIT (owner-ordered, still not started — this is item 38)

> "THAT IS ESSENTIAL THAT YOU VERIFY THE POSTING LAND IN THE RIGHT ACCOUNT FOR THE RIGHT REASONS."

For **every engine that writes to the GL** — expense, bill, bill payment, invoice, receive payment, company settlement, driver settlement, factoring advance, fuel, maintenance/work order, fixed asset, prepaid, credit memo, vendor credit, civil fine, insurance recovery, warranty reimbursement, property tax, revenue recognition — prove:

| Engine | Event | Debit account | Credit account | Why that account is correct | Live JE id proving it |
|---|---|---|---|---|---|

Rules to test against:
- Debits equal credits on every entry. No exceptions, no plugs.
- The account is the correct account **by type**, not merely a plausible name — expense to expense, A/P to liability, A/R to asset, revenue to revenue.
- **Statistical accounts 9100 (Fuel Consumed), 9110 (Fuel Inventory On Hand), 9200 (Downtime Cost), 9210 (Lost Revenue) carry `posts_to_financials = false`** and must be excluded from P&L, Balance Sheet, cash flow and QBO export. Prove they are.
- Cash basis and accrual both report correctly: entering a Bill does not hit P&L; the Bill Payment does.
- Every reversal lands in the same accounts as the original, opposite sign, dated the void date.
- Nothing posts twice. Nothing posts to a suspense or plug account.

Report every engine that fails, with the wrong account, the right account, and the fix commit.

---

# ORDER OF EXECUTION — DO NOT REORDER

**Phase 1 (audit) → Phase 2 (permanent fix + ratchet) → Phase 3 (void purge) → Phase 4 (sample purge) → Phase 5 (posting audit)**

Phase 3 does not start until Phases 1 and 2 are merged and deployed. That is the whole point of the owner's order.

# YOU DO NOT PAUSE FOR BLOCKERS

You have the same production access, the same repo and the same documents everyone else has. If something blocks you, find the answer and fix the blocker in the same session. Do not idle waiting on Lead. If a decision is genuinely the owner's — and only the Phase 4 name-matched list qualifies — put it in one batch and keep working on everything else meanwhile.

# WHEN YOU FINISH

Push, merge, trigger the deploy, paste the deploy id, and write your results to `claude/09-29-2026-Devin-B-ROUND-271-RESULTS.md` in the repo.

**The only acceptable reply: what I did · the proof it's real · what's next.**

---

# AMENDMENT 271.1 — A SECOND CONTAMINATION PATTERN, FOUND LIVE BY CC-1

CC-1 root-caused the factoring MTD defect while this round was being written. The cause is not only "reports forget to exclude voids." It is worse:

**Two `accounting.factoring_advances` rows (invoices 13619 and 13615) carry `voided_at` stamped 2026-09-28 with reason "ROUND-175 reversal" — but their `status` column was never flipped from `advanced` to `voided`.** The reason: **`executeVoidCancel` has no `factoring_advance` case**, so whatever voided them used a raw UPDATE that set the timestamp and nothing else.

Those same two rows explain both the MTD overstatement and the "invoices flagged advanced with no advance behind them" discrepancy. One root cause, two symptoms.

**So Phase 1 gets a second question, asked of all 18 tables:**

> **Does `executeVoidCancel` have a case for this entity — and do `voided_at` and `status` agree on every row?**

Report, per table:
- rows where `voided_at IS NOT NULL` but `status` is not a void status
- rows where `status` is a void status but `voided_at IS NULL`
- whether the void engine has a registered case for that entity, or whether voids there are being done by raw UPDATE

**An entity with no case in `executeVoidCancel` is a hole in the void engine, not a data defect.** Register a case for every entity that can be voided. A void that a human can perform through any path must go through the engine, and the engine must set the flag, the status and the reversing journal entry together, in one transaction, or set none of them.

CC-1 owns the fix for the factoring case and the two rows (AUTH-132, plus a DB-level `CHECK (voided_at IS NULL OR status = 'voided')`). **You own finding every other entity with the same hole.** Coordinate; do not duplicate his work on factoring.

## ONE MORE CORRECTION FOR THE RECORD

An earlier Lead statement that `factor.faro_invoice_lines` being empty proves "the Faro import never ran" is **withdrawn**. CC-1 verified live that the import code is wired and reachable and has run successfully before — a 34-row backfill on 2026-09-13 is recorded in the table's own header comment. The table is empty because the **AUTH-001 purge on 2026-09-23** wiped it, and it was never re-derived. The fix is re-running the working import once the purge window closes, not new code. Do not build an import.
