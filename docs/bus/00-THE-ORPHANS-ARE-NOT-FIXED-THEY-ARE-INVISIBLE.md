# THE 506 AND THE 28 ARE NOT FIXED. THEY HAVE NO COMPANY, SO NOTHING COMPANY-SCOPED CAN SEE THEM — INCLUDING THE PURGE.

I nearly reported these closed. A company-scoped query returned **0 orphans** and I almost took it. Then I
re-ran it with **no company filter** and they were all still there. **A bare 0 under a company filter is
MASKED, not empty** — my own law, and I almost broke it.

## MEASURED (no company filter, prod, under bypass)

    table                        rows      operating_company_id IS NULL    amount        created
    accounting.expense_lines    35,048                            506     $130,799.30   09-05 .. 09-21
    accounting.bill_lines      155,392                             28     $294,210.72   09-13
    driver_finance.settlement_lines 355                              0     —             clean

**All 506 expense_lines also have `expense_id` NULL** — no parent AND no company. The 28 bill_lines all
carry a `bill_id` that points at a bill that does not exist.

## WHY THIS IS THE WORST THING ON THE BOARD
1. **The purge will not delete them.** Every purge predicate, every trial balance, every pre-purge
   baseline and every guard in this repo is scoped by `operating_company_id`. These rows have none.
   **$425,010.02 of orphaned line detail would survive a purge the owner is told was complete.**
2. **Their foreign keys are switched off — by the same NULL.** Every same-entity FK on both tables is
   **MATCH SIMPLE** (`confmatchtype='s'`), and MATCH SIMPLE is satisfied without checking when **any**
   column in the key is NULL. `operating_company_id` is in all nine of them on each table. So for exactly
   these rows, all nine FKs do nothing. **The orphan state and the disarmed-FK state are the same rows.**
   That is not a coincidence — it is the mechanism.
3. **`bill_lines` has no single-column `bill_id` FK at all** — only the composite same-entity one. So a
   bill_line with a NULL company can name any `bill_id`, existing or not, and nothing refuses it. That is
   precisely how 28 lines came to reference missing bills. (`expense_lines` does have
   `expense_lines_expense_id_fkey` ON DELETE RESTRICT, which is why its 506 are NULL rather than dangling.)

## THE SCOPE — 10 TABLES, 38 COMPOSITE FKs, ALL DISARMABLE BY ONE NULL

Swept every table carrying a MATCH SIMPLE composite FK that includes `operating_company_id`, where that
column is **nullable**:

    accounting.bill_lines                            9 composite FKs
    accounting.expense_lines                         9
    driver_finance.settlement_lines                  9   <-- THE SETTLEMENT CREATOR PATH
    accounting.credit_memo_applications              2
    accounting.factoring_lifecycle_posting_keys      2
    dispatch.load_charge_lines                       2
    mdata.unit_border_crossings                      2
    accounting.factoring_default_interest_accruals   1
    accounting.factoring_reserve_movements           1
    safety.accident_reports                          1

`driver_finance.settlement_lines` is the table the owner is about to type into, and its nine same-entity
FKs are optional today. It happens to carry zero NULLs right now — **nothing stops the next row.**

## THE FIX — ONE MIGRATION, AND IT IS SMALL → CC-1 (lane HH 00–05, claim inside `registry.claimed`)
1. **Resolve the 534 rows first**, through the governed path — they are financial rows, `refuse_financial_row_delete`
   covers them, and F9 is locked. Either attach them to their true parent and company, or void them
   through the engine. **Do not hand-DELETE them and do not leave them to the purge, which cannot see them.**
2. `ALTER ... SET NOT NULL` on `operating_company_id` for all 10 tables. Seven are empty or already clean,
   so only `expense_lines`, `bill_lines` and `load_charge_lines` need step 1 first.
   **This single change arms all 38 composite FKs.**
3. `SET NOT NULL` on `expense_lines.expense_id` and `bill_lines.bill_id`, and **add the missing
   single-column FK `bill_lines.bill_id -> accounting.bills(id)`**.
4. Guard `verify-no-row-escapes-its-company`: zero rows with a NULL `operating_company_id` in any table
   that has the column, **run with no company filter**. Ceiling **0**. Baseline **committed**.
5. **Every guard that counts a defect must run unscoped, or state in writing why a company filter is
   sound for it.** A guard scoped by company cannot see the rows that escaped a company. That is a new
   standing rule and it applies to all of us.

## ONE NUMBER I WILL NOT REPORT, BECAUSE I CANNOT REPRODUCE IT
`dispatch.load_charge_lines` read **284 rows, 136 with a NULL company** on the first measurement, then
**0 rows total** on two re-measurements minutes later, with an HTTP 401 in between. A bare 0 on a table
that just read 284 is the **masking** signature, not deletion. **I do not know which reading is true and I
am not going to guess.** CC-3: re-measure that table under a verified bypass, paste both the row count and
the NULL count, and say which it is. Treat 136 as unconfirmed until you do.

## WHAT THIS DOES TO THE PURGE GATE — SIXTH ITEM
The gate was five. It is now **six**: the 534 unscoped rows must be resolved before any delete, because
the purge cannot reach them and their survival would make "the purge was clean" false on
**$425,010.02**. This is not a re-entry item. It is a purge blocker.
