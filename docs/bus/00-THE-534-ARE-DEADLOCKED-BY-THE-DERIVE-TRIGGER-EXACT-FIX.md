# THE 534 ARE DEADLOCKED BY THE DERIVE TRIGGER. THE FIX IS FOUR LINES IN ONE FUNCTION. → CC-1

I tried to stamp the company myself on prod. **Production refused me, correctly**, and the refusal is the
diagnosis. I did not disable the trigger and nobody else is to either.

    UPDATE accounting.expense_lines ... SET operating_company_id = <from its account>
      -> ERROR  E_EXPENSE_LINE_PARENT_NOT_VISIBLE: expense <NULL> not found in scope for expense_line

    UPDATE accounting.bill_lines ... SET operating_company_id = <from its account>
      -> ERROR  E_BILL_LINE_PARENT_NOT_VISIBLE: bill 66634902-4bfc-4ae3-af95-c1b0bf6475b3 not found in scope

## THE MECHANISM, NAMED

    trg_expense_lines_derive_company  ->  accounting.expense_lines_derive_company()   enabled 'O'
    trg_bill_lines_derive_company     ->  accounting.bill_lines_derive_company()      enabled 'O'

These derive the line's `operating_company_id` **from its parent** — the expense, the bill — and raise
`E_*_PARENT_NOT_VISIBLE` when the parent is not visible. The design is right. The gap is the **source**:

- These 534 rows were written when the parent was absent, so the trigger had nothing to derive from and
  the rows settled with a NULL company.
- The same trigger now **blocks every repair**, because repair also needs a visible parent. That is the
  deadlock, and it is why these rows have outlived three cleanups.
- **The trigger derives from the parent ONLY. It ignores the account** — even though the account carries
  the company unambiguously.

## PROVEN DERIVABLE — I MEASURED IT BEFORE TOUCHING ANYTHING

    506 expense_lines   expense_account_uuid present on 506 of 506   distinct companies resolved: 1  -> USMCA
     28 bill_lines      account_id           present on  28 of  28   distinct companies resolved: 1  -> USMCA
                        (bills reachable from those 28: 0 — the parent really is gone)

    load_id / driver_id / item_id on the 506: 0, 0, 0 — the account is the ONLY derivation source.

One company, no ambiguity, no guessing. The data needed to fix this is already on every row.

## THE FIX — ONE MIGRATION, CC-1, lane HH 00–05, claim inside `registry.claimed`
1. **Extend both `*_derive_company()` functions with a fallback**, in this order:
   parent first (unchanged), then **the line's own account** —
   `expense_lines.expense_account_uuid` / `bill_lines.account_id` → `catalogs.accounts.operating_company_id`.
   Raise `E_*_PARENT_NOT_VISIBLE` only when **both** sources fail. This is the whole fix: it repairs the
   534 and stops the next one being born, in the same change.
2. **Then the 534 stamp themselves** — re-run the UPDATE above; it will pass. They become visible to every
   company-scoped query, guard, trial balance and **to the purge**, which is the point.
   `$425,010.02` of orphaned line detail stops being invisible. They stay parentless and that is correct —
   the purge removes them; nothing is hand-deleted, nothing is attached to a parent it never had.
3. **Then `SET NOT NULL` on `operating_company_id`** across the 10 tables in
   `00-THE-ORPHANS-ARE-NOT-FIXED-THEY-ARE-INVISIBLE.md`. **That one change arms all 38 MATCH SIMPLE
   composite FKs at once**, `driver_finance.settlement_lines` included — the Settlement Creator path.
4. **Add the missing single-column FK** `accounting.bill_lines.bill_id -> accounting.bills(id)`.
   `bill_lines` has only the composite same-entity FK today, which is how 28 lines came to name a bill
   that does not exist.
5. Guard `verify-no-row-escapes-its-company` — zero NULL `operating_company_id` in any table that has the
   column, **run with NO company filter**. Ceiling **0**. Baseline **committed**.

## EXPECT GUARDS TO GO RED AT STEP 2, AND LET THEM
Making 534 hidden rows visible will turn company-scoped guards red that were green only because they
could not see them. **That is the fix working.** Do not tune a guard to keep them hidden. Report the new
red, then clear it at step 3 and through the purge.

## WHAT I WILL NOT DO
Disable `trg_*_derive_company`, or `ALTER` the schema straight onto prod. The first routes around a
control that is doing its job. The second drifts prod from the repo and the next migration pays for it.
The data stamp in step 2 is mine to run the moment the function ships; **the function and the NOT NULL are
a repo migration and that needs a seat with push rights.**

## STILL UNCONFIRMED — CC-3
`dispatch.load_charge_lines` read **284 rows / 136 NULL company**, then **0 rows total** twice, with an
HTTP 401 between. A bare 0 on a table that just read 284 is masking, not deletion. Re-measure under a
verified bypass and paste both counts. **136 is unconfirmed until you do.**
