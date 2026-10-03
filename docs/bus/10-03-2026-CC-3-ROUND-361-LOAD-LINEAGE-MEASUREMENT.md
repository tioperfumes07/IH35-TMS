# CC-3 — ROUND 361 — LOAD LINEAGE — MEASUREMENT (before any migration)

Prod, 2026-10-03, DIRECT endpoint as neondb_owner under `SET LOCAL app.bypass_rls = 'lucia'` (the pooled URL can arrive
as ih35_app and undercount — OUTBOX 2026-10-03). USMCA unless stated. No row changed.

**Columns:** carry = the row stores its load · derivable = load NULL but exactly ONE distinct load is provable from a
parent/child that stores it (named) · no load = nothing provable — stays NULL and is reported, never guessed.
"Should" = carry + derivable; "no load" rows are either non-load documents or purge population — listed, not judged.

| Table | Load column | Rows (live) | Carry | Derivable (from) | No provable load |
|---|---|---|---|---|---|
| accounting.expenses | load_id | 553 (550) | 552 | 0 | 1 |
| accounting.expense_lines | load_id | 564 | 560 | 3 (header) | 1 |
| accounting.bills | load_id | 93 | 68 | 22 (bill_lines) | 3 — the 3 unpaid bills, $566.35 |
| accounting.bill_lines | load_id | 93 | 90 | 0 | 3 (same 3 bills) |
| driver_finance.driver_bills | load_id | 136 | 136 | 0 | 0 |
| accounting.invoices | source_load_id | 111 (110) | 110 | 0 | 1 |
| accounting.invoice_lines | source_load_id | 106 | 105 | 0 | 1 |
| **accounting.bill_payments** | **NONE** | 130 | 0 | 98 (bill → bills.load_id) | 32 (bill without a load) |
| **accounting.payments** | **NONE** | 7 | 0 | 6 (applications → invoices) | 1 |
| accounting.credit_memos / vendor_credits | NONE | 0 / 0 | — | — | — |
| driver_finance.settlement_lines | load_id | 355 | 352 | 0 | 3 |
| fuel.fuel_transactions | load_id | 323 | 323 | 0 | 0 |
| driver_finance.driver_advances | load_id | 12 | 12 | 0 | 0 |
| dispatch.load_charge_lines | load_id | 148 | 148 | 0 | 0 |
| dispatch.load_cancellations | load_id | 16 | 16 | 0 | 0 |
| banking.bank_transactions | matched_load_id / categorization_load_id | 981 (974) | 0 | 0 (69 matched to a doc, none of those docs carry a load) | 981 |

Lead's known figures confirmed: bills NULL 25 of 93 (= 22 derivable + 3 not) · expenses NULL 1 · invoices NULL 1.

**REVERSALS — journal entries with reverses_je_id (the reversal carries no load column; measured through the spine
links and the postings' source_transaction_type/id, then that document's own load column):**

| | USMCA | TRANSP |
|---|---|---|
| reversal JEs | 1,469 | 23 |
| original was load-born (reaches a load) | 268 | 2 |
| reversal reaches the load only THROUGH the original document | 114 | 0 |
| reversal cannot reach the load at all | **154** | 2 |
| reversal carries the load itself | **0** | 0 |

Of the 1,469, the ORIGINAL postings of 1,024 carry no spine link at all (CC-2's silent posting path) and 987 reversals
carry none — the spine is the larger gap; the load hop sits on top of it.

**What the build will be (after the Lead reads this) — no new table:**
1. `bill_payments.load_id` + `payments.load_id` (nullable — a payment can span loads), derived once in the migration
   ONLY where exactly one load is provable (98 / 6), the rest NULL and listed; writers set it at creation.
2. bills: derive the 22 from their lines once; the 3 unpaid stay NULL (reported). Expense / invoice / settlement-line
   singletons listed by id in the PR, not guessed.
3. Reversals carry the load: postVoidReversal / reverseJournalEntryNoFlip write a second spine link per reversal posting,
   `linked_object_type='load'` (role `reversal_of_load`), copied from the original document's load in the same
   transaction — the existing spine, not a lineage table.
4. DB refusal: a load-born document written with NULL load (a bill / expense / invoice whose own lines name a load).
5. Guards: `verify-every-load-born-document-carries-its-load`, `verify-every-reversal-carries-its-originals-load`,
   ceiling = the listed rows above, committed, unscoped (direct read, role pinned).
