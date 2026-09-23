# THE PURGE CANNOT DELETE. THE DATABASE IS WORM BY DESIGN.

**Lead, 2026-09-23. Proven live, on a real copy of production, not read off a document.**

## What I did

Created Neon branch `br-spring-dream-akk31fyt` off production `br-fancy-credit-akjnd07a` at
LSN `E7/9936D28` - a real copy, so nothing could touch production - and ran the generated
56-statement purge against it.

## What happened

It died on statement 10 of 63:

```
NeonDbError: accounting.escrow_postings is append-only
```

The transaction rolled back whole. The branch is untouched.

## Why - and this is the part that changes the plan

This database is deliberately **WORM**. Migration `202612220000_worm_financial_tables_no_delete.sql`
installed it after confirmed, unrecoverable live row loss on production, measured from
`pg_stat_user_tables.n_tup_del`:

| table | rows silently deleted, gone |
|---|---|
| `banking.bank_transactions` | 46 |
| `accounting.bill_lines` | 44 |
| `accounting.bills` | 28 |
| `driver_finance.driver_settlement_deductions` | 14 |
| `driver_finance.driver_settlements` | 7 |

That migration's own words: *"Financial rows are never deleted - void or reverse the document
instead."* It added `voided_at`, `void_reason` and `voided_by_user_id` to every financial table
**for exactly this purpose**, with a CHECK constraint refusing a void that does not say why.

There are two distinct layers, and the difference decides everything:

**1. Role-scoped WORM - `trg_worm_refuse_delete` / `accounting.refuse_financial_row_delete()`.**
It refuses only when `current_user = 'ih35_app'`, plus `REVOKE DELETE ... FROM ih35_app`. It is
on ~60 financial tables: bills, bill_lines, bill_payments, invoices, invoice_lines,
invoice_disputes, journal_entries, journal_entry_postings, payments, payment_applications,
expenses, expense_lines, factoring_advances, company_settlements, driver_bills,
driver_settlements, settlement_lines, driver_settlement_deductions, driver_settlement_gl_bills,
driver_advances, driver_liabilities, driver_reimbursements, escrow_ledger, escrow_balances,
bank_transactions and more. **A purge run as the database owner role passes through it.**

**2. Hard append-only - no role escape at all.** These refuse every role, and the purge dies on
the first one it reaches:

- `accounting.escrow_postings` - `prevent_escrow_posting_mutation` **(this is what killed the run)**
- `accounting.ob_register_audit_events` - `ob_register_audit_append_only_trigger`
- `accounting.period_cash_basis_snapshot` - `period_cash_basis_snapshot_block_mutation`
- `driver_finance.settlement_payment_events` - `settlement_payment_events_block_mutation`
- `dispatch.stop_arrivals` - `stop_arrivals_delete_block`
- `dispatch.auto_status_suggestions` - `block_auto_status_suggestions_mutation`
- `driver_finance.historical_settlement_attributions` / `_items` - immutable

The 2026-09-22 purge SQL never named most of these, which is why nobody hit the wall. The
corrected SQL names them, which is how we found it - on a branch, for free, instead of half way
through a production purge with 3,000 rows already gone and no transaction left to roll back.

## What this means

**The owner was right on instinct.** His ruling - *"MAYBE ALL SHOULD BE VOIDED FIRST, THEN
DELETED"* - is not a preference. It is the only operation this database permits, and it is also
what QuickBooks and NetSuite do: you do not delete a posted transaction, you void or reverse it.

So the operation is not a purge. It is a **mass void**, and E10 - the void runner - is not one
of thirteen engines. **It is the engine.** The DELETE half is, at most, a cleanup of the
non-financial scaffolding afterwards, and for the eight hard append-only tables it is not
available at any price short of dropping the trigger, which would destroy the control that was
installed because real money already vanished once.

## What I am NOT doing

I am not dropping a WORM trigger. I am not running the purge as the owner role to slip past a
control that exists because 139 financial rows were already lost unrecoverably. Both are
available and both are wrong.

## What changes now

1. **E10 is the critical path**, not an item on a list. Every seat's thirteen still stands, but
   the void runner is what the feed actually waits on.
2. `br-spring-dream-akk31fyt` is a clean copy of production at `E7/9936D28`. **It is handed to
   CC-3 as the E10 proving branch.** It is not `br-sweet-math-akyen17f`, which Cursor truncated.
3. The generated purge SQL stays - it is correct about scope and order, and it is what found
   this. It is reclassified from "the purge" to "the post-void scaffolding cleanup", and the
   eight hard append-only tables move out of its PURGE list into a named, explained exclusion.
4. **An owner decision is owed, and only one:** for the eight append-only evidence tables -
   escrow postings, the OB register audit trail, the cash-basis period snapshot, settlement
   payment events, stop arrivals - do they stay forever as history of a period we are
   re-feeding, or do they get an explicit, audited, one-time neutralization? They are evidence.
   My recommendation is that they stay, and the feed is made idempotent against them. That is
   the QuickBooks answer and it is the one a CPA would expect.
