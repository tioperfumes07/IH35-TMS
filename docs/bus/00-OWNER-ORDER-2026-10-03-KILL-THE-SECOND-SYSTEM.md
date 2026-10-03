# OWNER ORDER — 2026-10-03 — KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE. POLICIES STAY.

Owner, verbatim, all seats, 2026-10-03. This is a **DELETION**, not a build. Cursor lead measured
live (Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `bypass_rls=lucia`, USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80`) and dispatched. Do not re-ask. Do not invent a thirteenth
table. Do not "repair" drifted rows by hand.

## THE OWNER'S WORDS, VERBATIM

> ALL SEATS — ORDER — KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE. POLICIES STAY.
>
> THIS IS A DELETION, NOT A BUILD.
> The QuickBooks format is already live and correct: 2100 Driver Escrow – Held in Trust
> with 2100-00-nnn per driver, and 1245 Driver Cash Advances Receivable with a
> sub-account per driver, both auto-provisioned on hire. Measured: 27 live drivers,
> 28 live escrow sub-accounts, 28 live advance sub-accounts. Nothing has to be built
> to "work like QuickBooks." The second system has to stop existing.
>
> THE RULE THAT DECIDES WHAT DIES
> - A BALANCE is DERIVED from the postings. Never stored, never cached without a guard.
> - A POLICY, RULE, PLAN or DOCUMENT is STORED. "Deduct $25 a settlement to the $2,500
>   cap." "He owes $3,000, $250 a settlement." "This advance was approved on this date."
>   Those stay. NOTHING in this order deletes a policy or a document.
> - The test: could a CPA recompute this number from the postings? Then derive it.
>
> METHOD — ONE TABLE PER PR
> 1. Name the GL account that owns the number, in the PR body.
> 2. REPOINT THE READERS FIRST. Every screen, report, API and service reads the account
>    balance. Ship that and prove the screen still shows the right number BEFORE the
>    column goes. No screen may ever read both.
> 3. Replace the column with a VIEW over that account's postings. If a physical column
>    must stay for speed it is a CACHE: written in the SAME transaction as the posting,
>    on INSERT, UPDATE and DELETE, by nothing else, ever.
> 4. Guard verify-\<name\>-equals-its-gl — value = GL account balance per driver/vendor,
>    row count = live sub-account count. Ceiling 0. Baseline COMMITTED. Run UNSCOPED.
> 5. Repair nothing by hand. Drifted rows are purge population. Fix writers, not rows.
> 6. Report PER TABLE against the ten points, live query pasted.
>
> THE SPINE — HOW THE TWO HALVES MEET
> A derived balance answers HOW MUCH. The spine answers WHERE IT CAME FROM. Both are
> now enforced in the database (trg_live_posting_keeps_spine_link is on prod).
> FINISH TEST for every table: click the number on the screen, drill to the account,
> drill to the postings, drill to the source document. If the chain breaks, it is not
> done. If the number came from a column instead of the chain, it is not done.
>
> PERMANENT — CLOSED REGISTER
> A number QuickBooks derives, we derive. Per-driver and per-vendor detail lives in
> sub-accounts, auto-provisioned. Operational detail QuickBooks does not carry — load,
> unit, driver, trailer — lives as columns on the transaction. No parallel running
> totals, ever. A new table carrying an account balance is refused at review.

## THE TWELVE — WHAT DIES / WHO OWNS IT / WHAT STAYS

| # | Column that dies | GL that owns it | Seat | What stays |
|---|------------------|-----------------|------|------------|
| 1 | `accounting.escrow_accounts.balance_cents` | `2100-00-nnn` | **CC-1 START** | mapping row (`holder_id`, `coa_account_id`, purpose, status) |
| 2 | `driver_finance.escrow_balances.current_balance_cents` | `2100-00-nnn` | CC-1 | becomes a VIEW |
| 3 | `driver_finance.escrow_balances.total_held_cents` | `2100-00-nnn` | CC-1 | derived: sum of deposits |
| 4 | `driver_finance.escrow_balances.total_released_cents` | `2100-00-nnn` | CC-1 | derived: sum of releases |
| 5 | `driver_finance.escrow_ledger.running_balance_cents` | `2100-00-nnn` | CC-1 | **THE LEDGER ROWS STAY** |
| 6 | `driver_finance.driver_advances.outstanding_balance` | `1245` / sub | CC-1 | **THE ADVANCE DOCUMENT STAYS** |
| 7 | `driver_finance.driver_liabilities.current_balance` | its account | CC-1 | **THE LIABILITY RECORD STAYS** |
| 8 | `driver_finance.driver_deduction_buckets.remaining_balance` | `1245` / account | CC-2 | **THE POLICY STAYS**: amount, cap, reason, `may_draw_escrow` |
| 9 | `driver_finance.driver_settlement_deductions.remaining_bal` | same | CC-2 | **THE DEDUCTION LINE STAYS** |
| 10 | `accounting.faro_reserve_entries.running_balance_cents` | `1230` | CC-2 | **THE MOVEMENT ROWS STAY** |
| 11 | `accounting.faro_reserve_entries.short_pay_balance_cents` | `1230` | CC-2 | short-pay event + credit memo |
| 12 | `accounting.vendor_balances.balance_cents` | A/P control | **CC-3 LAST** | already a VIEW — confirm it never drifted vs A/P |

## LIVE MEASURE (lead, 2026-10-03T13:20Z, USMCA, bypass_rls=lucia)

Owner-named 27 / 28 / 28. Lead re-measured:

| Fact | Count |
|------|------:|
| Live drivers (USMCA, not sample, not terminated, name not TEST/CODEX/SAMPLE) | **27** |
| `catalogs.accounts` `2100` parent "Driver Escrow - Held in Trust" | 1 |
| `2100-00-nnn` sub-accounts total | 41 (includes TEST/CODEX/SAMPLE/Autoprovision) |
| `2100-00-nnn` excluding TEST/CODEX/SAMPLE/Battery/Autoprovision | **29** |
| `1245` parent "Driver Cash Advances Receivable" | 1 |
| Advance subs (`DRIVERCASHAD%`, not `1245-00-nnn`) excluding TEST/CODEX/SAMPLE/Battery | **29** |
| `accounting.escrow_accounts` driver rows | **44** |
| `escrow_accounts.balance_cents` sum | **237500** ($2,375.00) |
| Same rows vs `journal_entry_postings` on `coa_account_id` (credit−debit, `voided_at IS NULL`, unreversed) | **19 of 44 drift**; GL sum **−632500** |
| `driver_finance.escrow_balances` | 18 |
| `driver_finance.escrow_ledger` | 224 |
| `driver_finance.driver_advances` | 12 |
| `driver_finance.driver_liabilities` | 12 |
| `driver_finance.driver_deduction_buckets` | 0 |
| `driver_finance.driver_settlement_deductions` | 67 |
| `accounting.faro_reserve_entries` | 0 |
| `accounting.vendor_balances` | **already `relkind=v`** over `accounting.bills` (not A/P GL) |

The 19-row column↔GL drift is **purge population**. Do not UPDATE `balance_cents` to match. Fix the
writers so new postings land on `2100-00-nnn`, then readers read the postings.

Advance sub-accounts on prod are numbered `DRIVERCASHAD896665-nnn`, not `1245-00-nnn`. The parent
`1245` is correct. Do not remint. Report the live numbering; do not invent a second series.

## ORDER OF WORK (strict)

1. **CC-1 START — table 1 only, one PR:** `accounting.escrow_accounts.balance_cents` → readers read
   `2100-00-nnn` from `accounting.journal_entry_postings`. Mapping row stays. No column drop in PR1.
2. CC-1 tables 2–5 (escrow_balances three columns + escrow_ledger.running_balance) — one table/column-set
   per PR after PR1 is on tip.
3. CC-1 tables 6–7 (driver_advances.outstanding_balance · driver_liabilities.current_balance).
4. **CC-2** tables 8–9 (deduction policy stays) then 10–11 (faro movement rows stay). Do not start
   until CC-1 table 1 is MERGED on tip.
5. **CC-3 LAST** table 12. `vendor_balances` is already a view over bills. Confirm it never drifted
   vs A/P control. If it does not equal A/P GL, repoint the view to A/P postings. Zero triggers
   maintain it — do not add a writer.

R-1 (CC-1 damage-loss 6176) **waits for table-1 reader-repoint**. Building R-1 against
`escrow_accounts.balance_cents` is building the second system. After PR1, R-1 reads 2100.
R-2 (CC-2 gallon fuel cap) is a **POLICY** — it stays / continues in parallel. It is not a stored
balance.

## METHOD — enforced on every PR in this register

1. Name the GL account in the PR body (`2100-00-nnn` / `1245` / `1230` / A/P control).
2. Repoint every reader first. No screen may read both the column and the GL.
3. Then VIEW (or SAME-TXN cache). Never a free-standing UPDATE of a balance column.
4. Guard `verify-<name>-equals-its-gl` — value = GL per driver/vendor; row count = live sub-account
   count; ceiling 0; baseline committed; run UNSCOPED.
5. Repair nothing by hand.
6. Report the ten points + pasted live query per table.

## FINISH TEST (every table)

Click the number → drill to the account → drill to the postings → drill to the source document.
Spine (`trg_live_posting_keeps_spine_link`) must hold. A number from a column is not done.

## PERMANENT

A new table carrying an account balance is refused at review. Closed register.

## WHAT THIS SUPERSEDES

- Owner ruling 2026-09-05 that `accounting.escrow_accounts.balance_cents` is the canonical escrow
  number. The **mapping row** stays canonical for holder→`2100-00-nnn`. The **number** is the
  postings on that account. `verify-escrow-balance-reconciles-gl` must be rewritten to compare
  GL 2100 vs any remaining cache/view — it must not treat the dying column as authority.
- Leftover token-drain (BANK-F911xx) is overflow. This order is the queue.
- ROUND 348 remaster stays parked (ambient `bank_transactions` 951→981). Do not update that baseline.

NO seed. NO Chrome (owner walks). NO Book Load. USMCA only. Void-not-delete on documents; this
order deletes **stored balances**, not documents.
