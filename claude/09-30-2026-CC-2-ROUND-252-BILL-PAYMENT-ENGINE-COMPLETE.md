# ROUND 252 — CC-2 — BILL PAYMENT ENGINE, QBO PARITY, BUILT COMPLETE

## ANTI-DRIFT CONTRACT — READ BEFORE THE FIRST LINE OF CODE
1. You build EVERY item on your list COMPLETELY: schema, migration, backend service, route DEFINED
   and MOUNTED and CONSUMED by a real frontend surface, GL postings, linkage both ways to every hub,
   catalogs, guards, backfill, and print where it applies. **The Check Creator was reported DONE
   while sitting unmounted and dead for weeks. That must never happen again.**
2. NO HANDING OFF. If something blocks you, you MEASURE it, FIX it, and report what you fixed. The
   only thing you escalate is a write the owner has not authorized.
3. NO PATCHING. Root cause only. No report-only guards, no skips, no `--no-verify`, no exception
   lists, no "same pattern as X" without evidence.
4. NO DRIFT. Do not invent tables, concepts or names not in this document. Do not rename anything.
   Do not "improve" the design. If you believe something here is wrong, say so in ONE paragraph with
   the measurement that proves it, then do what this document says.
5. NEVER write test, sample or demo rows into USMCA — including for proof. Two seats broke this and
   are still reconciling it.
6. USMCA ONLY: 5c854333-6ea5-4faa-af31-67cb272fef80. TRANSPORTATION and TRUCKING stay frozen.
   Reads require BOTH lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
7. Blank is blank. Unknown prints `—`. Never 0 for unknown, never a substituted value.
8. Every guard is REQUIRES_LIVE_DB. A guard that cannot connect is a FAIL, never a pass.
9. Save your completion report to the repo at `claude/<date>-<SEAT>-<ROUND>-REPORT.md` so nothing is
   lost. Cite live SQL output for every claim. Never report DONE without pasted proof.
10. You have API keys available in the Desktop files. No seat may claim it lacks a key.

## YOU WERE RIGHT AND IT IS ON THE RECORD
Your P2 finding corrected the Lead. The 130 bill_payments are driver bills whose cash already posted
via the settlement payrun-close JE. You refused to force-post them and that refusal prevented a real
double-booking. CC-1 ROUND 251 Item 1 fixes the guard. **Push your P0 `58e5356b11` the moment it
lands.** Do not `--no-verify`. Do not force-post.

## ITEM 1 — CHECK NUMBER RECONCILIATION, BEFORE ANYTHING PRINTS
`banking.check_number_registry` holds 5 rows, ALL of them $1.00 proof checks to AMPARTS TRUCK &
TRAILER, numbers 1001-1005, all voided, `is_sample_data=false`. Zero real checks have ever been
written; live expenses with `payment_type='check'` = 0. The next real check is 1006, so if the paper
stock starts at 1001 the system and the physical stock are five apart.
Report what `banking.check_stock_settings` says the next number is. Build an AUDITED one-time
starting-number reset — who, from what, to what, when, why — so the owner aligns system to paper
himself. Never silently renumber. Never reuse a consumed number. Guard it.

## ITEM 2 — THE BILL PAYMENT ENGINE, WIRED END TO END
A check written to a payee who has open bills is NOT a new expense — it is paying something already
owed. Recording it as a fresh expense books the cost TWICE.
TABLES: `banking.bill_payments` (payee, bank_account_id, payment_type check|ach|wire|card|cash,
check_number, payment_date, total_cents, memo, journal_entry_id, print_batch_id) and
`banking.bill_payment_applications` (bill_payment_id, bill_id, applied_cents, discount_cents,
credit_memo_id), UNIQUE (bill_payment_id, bill_id).
DATABASE CONSTRAINTS, not UI checks: applications sum to the payment minus unapplied; no bill is ever
over-applied; partial payment leaves the correct open balance; overpayment creates a vendor credit
and never a negative bill.
UI: selecting a payee loads that vendor's OPEN BILLS into a side panel — bill number, date, due date,
original amount, open balance. Ticking fills the applied amount, editable down to a partial. A live
applied/unapplied figure. Saving with an unapplied balance asks ONCE whether the remainder is a
prepayment or an expense line and records the answer. No open bills = behaves as a plain check and
says so.
GL, CASH BASIS: entering a bill does not hit the P&L; PAYING it does. Dr Accounts Payable, Cr bank.
ONE balanced JE per payment from `bill_payments.journal_entry_id`, every application line traced to
its bill.
LINKAGE BOTH WAYS: payment ↔ bill ↔ vendor ↔ unit ↔ load ↔ driver ↔ `docs.files` (the bill image) ↔
`accounting.journal_entries` ↔ `banking.check_number_registry` ↔ the bank transaction it matches.

## ITEM 3 — BANK MATCHING
The owner matches documents to bank register transactions. Every bill payment must be matchable and,
once matched, carry the bank transaction id both ways. A payment that cannot be matched is a defect,
not a user problem.

## ITEM 4 — THEN, IN ORDER
Re-measure your held stack (B5/B8/R218/R224) and state which item actually depended on CC-1 and which
was assumed; push everything that did not. Then ROUND 140.3 — due 2026-09-24, **five days late**.
Then the Loves fuel statement object, the two-surface split, and the materiality threshold, each with
measured options and one recommendation.

## GUARDS — ALL REQUIRES_LIVE_DB
`verify-check-number-never-reused.mjs` (including voided) · `verify-bill-payment-applications-never-over-apply.mjs`
· `verify-check-to-vendor-with-open-bills-is-never-booked-as-expense.mjs` (**the double-booking guard —
most important**) · `verify-every-bill-payment-has-a-balanced-journal-entry-or-adoption-memo.mjs` ·
`verify-bill-payment-print-carries-check-number-and-stub.mjs` · `verify-bill-payment-is-bank-matchable.mjs`

## PROOF REQUIRED
A REAL bill payment by check against a REAL open vendor bill end to end — bill before, check created,
open-bills panel screenshot, application row, balanced JE, bill closed, A/P moving by exactly that
amount, bank match. A PARTIAL payment leaving the correct balance. The check-number reset audit row.
Live URL of the check form showing the open-bills panel. Every guard passing.
Never write a test payment into USMCA — use a real bill and a real amount, or ask for a ruling.
