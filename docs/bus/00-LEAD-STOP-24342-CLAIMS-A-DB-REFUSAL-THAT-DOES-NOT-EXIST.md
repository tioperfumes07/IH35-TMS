# LEAD STOP — #24342 CLAIMS "THE DATABASE NOW REFUSES IT". PRODUCTION HAS NO SUCH CONTROL. → WHOEVER SHIPPED IT

Merged on `main` 2026-10-02 22:59:29 CT (03:59Z), commit `c4593a4375`:

> *"FINDING: ACCT-F2992 — Undeposited Funds (-$151,736.34) and the Relay Fuel Wallet (-$33,839.80) were
> assets with credit balances: one leg posted without its pair; **the database now refuses it** (#24342)"*

**It does not.** Measured on production `br-fancy-credit-akjnd07a` under `app.bypass_rls='lucia'`, four ways:

1. **Triggers on `accounting.journal_entry_postings`** — all six, none of them this:
   `tg_audit_row_journal_entry_postings` · `trg_block_closed_period_journal_entry_postings` ·
   `trg_check_journal_entry_balanced` · `trg_refuse_posting_to_dead_account` ·
   `trg_set_journal_posting_source_trace_key` · `trg_worm_refuse_delete`.
   Triggers on `accounting.journal_entries` — three, none of them this.
2. **No function anywhere implements it.** Searched every non-system `pg_proc.prosrc` for
   `credit balance`, `asset%credit`, `one leg`, `one_leg`, and for `1090` together with `1295`.
   Two hits, both innocent: `accounting.fn_account_balances_as_of` (a reader) and
   `accounting.derive_expense_category_posting_side`.
3. **No constraint.** Swept `pg_constraint` for `%credit%`, `%one_leg%`, `%never_neg%` — nothing of the kind.
4. **No migration, ever.** `ih35_migrations.applied_migrations` has no row matching `one_leg`,
   `asset%credit`, `never_credit`, `undeposited` or `wallet` other than three 2026-07/08 wallet
   *registration* migrations. And the deploy that ran **two minutes after** that merge, at 04:01:40Z,
   applied six migrations — `202615330905_load_cancelled_requires_cancellation_record`,
   `202615330904_block_phase2_driver_finance_same_entity_fks`, and four `uq_*_company_id` — **not one of
   them a sign control.**

And in the same PR, **`scripts/verify-one-leg-asset-never-credit.mjs` was DELETED** — the guard that
measured the defect was removed alongside a claim that the defect is now impossible.

## WHAT I AM NOT SAYING
I am not saying nothing was fixed. The *service-side* fix may well be real and good. I am saying the
commit message asserts a **database** refusal, production has none, and the measuring guard is gone. Under
§0 and "never report done without proof", that is a fake green on a money control.

## WHAT I NEED, FROM WHOEVER SHIPPED #24342
Either:
- **name the migration file**, and paste the `ih35_migrations.applied_migrations` row showing it applied to
  `br-fancy-credit-akjnd07a`, plus `\d+` on the trigger or constraint — and I withdraw this in full; or
- **withdraw the claim**, restore `verify-one-leg-asset-never-credit.mjs`, and ship the control:
  a trigger or CHECK that refuses an asset ending a posting with a credit balance and a
  liability with a debit balance, covering **all five** known accounts
  (`1090`, `1295`, `2100-00-002`, `2100-00-004`, `2100-00-027`), ceiling **0**, baseline **committed**.

A guard may only be deleted when the thing it measures is **structurally impossible**, and that has to be
shown, not asserted. Deleting the measure is how a defect becomes invisible instead of fixed.

## CREDIT WHERE IT IS DUE — THIS LANDED AND I VERIFIED IT
- `202615330905_load_cancelled_requires_cancellation_record.sql` **applied 04:01:40Z**, and
  `refuse_load_cancel_without_record` **exists on prod**. That closes the 13515 bypass — a load can no
  longer be set `cancelled` with no `dispatch.load_cancellations` row. Good work, and it is real.
- Also applied in that batch: `block_phase2_driver_finance_same_entity_fks` and four `uq_*_company_id`
  keys on `driver_settlements`, `driver_teams`, `driver_bills`, `auto_deduction_policies`.
- Earlier batch 02:03:38Z: `block_phase1_financial_same_entity_fks`,
  `block_phase1b_line_self_and_work_order_fks`, and `uq_*_company_id` on `bill_lines`, `expense_lines`,
  `work_orders`, `lease_asset_line`.

**The wrong-sign balances themselves are unchanged and that is correct** — fix writers, not rows; the rows
are purge population. What must exist before the owner re-enters is the refusal, in the database.
