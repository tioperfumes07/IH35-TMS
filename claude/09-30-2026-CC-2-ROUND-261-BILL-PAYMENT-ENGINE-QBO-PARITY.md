# ROUND 261 — CC-2 — YOU ARE RELEASED. BUILD THE BILL PAYMENT ENGINE COMPLETE.

## PART A — SHARED LANGUAGE. WE ALL USE THESE WORDS AND NO OTHERS.
The app clones QuickBooks. So do our words. Do not invent synonyms, do not rename anything.

| Term | What it means here — QBO meaning, nothing else |
|---|---|
| **Expense** | Money spent, recorded directly. Posts a journal entry the moment it is saved. |
| **Bill** | A vendor invoice we owe. Creates Accounts Payable. On CASH basis it does NOT hit the P&L. |
| **Bill Payment** | Paying a Bill. On CASH basis THIS is where the expense is recognised. Dr A/P, Cr bank. |
| **Driver Bill** | The Bill created when a driver settlement closes. Paying it is a Bill Payment. |
| **Check** | A Bill Payment made by check, carrying a check number from the registry. |
| **Receive Payment** | Customer money against an Invoice. Dr bank, Cr Accounts Receivable. |
| **Invoice** | What we bill the customer. Creates Accounts Receivable. |
| **Journal Entry (JE)** | The balanced debit/credit posting. Every document above produces exactly ONE. |
| **Recorded** | The document is saved. **Its JE exists from this instant.** |
| **Cleared / Matched** | Linked to a bank transaction. A STATUS ONLY. Creates NO journal entry. |
| **Reconciled** | The bank statement period is closed. A STATUS ONLY. Creates NO journal entry. |
| **Void** | Record kept, amount zeroed, number kept, shows as VOID. Does not affect totals. |
| **Delete** | Removed from the app entirely. Survives ONLY in the audit archive. |

## PART B — THE POSTING RULE. OWNER-CONFIRMED. THIS IS LAW.
**A document posts its journal entry WHEN IT IS RECORDED, dated the transaction date. It does NOT
wait for bank matching.**
Owner, verbatim: *"if you write a check on Dec 31 but it is deposited on January 03, the accountant
reports it as a December payment and balances are reduced."* That is correct and it is exactly how
QuickBooks and NetSuite behave.
Three separate moments, never conflated:
1. **RECORDED** — JE created, dated the transaction date. Money moves in the books here.
2. **CLEARED / MATCHED** — matched to the bank transaction. Sets a status. **No JE.**
3. **RECONCILED** — statement period closed. Sets a status. **No JE.**
If posting waited for matching, the P&L would be empty until the bank feed caught up and a period
could never be closed on time. Any code that withholds a posting until a bank match is a DEFECT.
MEASURED: 296 posted expenses, **0 bank-matched**. 257 unposted, **0 bank-matched**. Posting and
matching are already independent. Matching is NOT what is holding the drafts.

## PART C — THE VOID ENGINE STANDARD. RESEARCHED, NOT ASSUMED.
Per Intuit's own documentation: **Void** keeps the record in the books at zero, keeps the transaction
NUMBER, shows as void, and does not affect totals. **Delete** removes it from every area of the app
EXCEPT the audit log, which preserves it so it can be re-entered. Both are irreversible. Voidable
types: invoices, bill payments, payments, checks, expenses.
OUR RULES, built to that standard:
1. VOID is the default for anything that ever posted. The number is retained — a voided check keeps
   its number so the sequence stays intact.
2. DELETE removes it from the app, and the archive table IS our audit log. Nothing is ever deleted
   without its full pre-image in `archive.*` first.
3. Duplicate identity is `(operating_company_id, vendor_uuid, vendor_document_number,
   transaction_date, total_amount_cents)`, and every decision ALSO records `unit_id`, `load_id`,
   `driver_id`, `payment_type`. Owner ruling: **date, vendor, unit, load and amount — many
   variables, never two.** NULL document number = NOT comparable = human review queue.
4. Every void names WHO, WHEN, WHY (from a catalog, never free text), the exact row it supersedes,
   and its reversal JE. A void with no named supersede target is itself a defect.
5. **No transaction is ever lost or stuck.** Every expense, bill, bill payment, invoice, receive
   payment and fuel transaction sits in exactly ONE terminal state: posted · draft · voided ·
   in-review-queue · deleted-with-archive. Anything in none of those is a FAILURE.

## PART D — ANTI-DRIFT CONTRACT
1. Build EVERY item COMPLETELY: schema, migration, service, route DEFINED + MOUNTED + CONSUMED by a
   real screen, GL postings, linkage both ways to every hub, catalogs, guards, backfill, print.
   **The Check Creator was reported DONE while sitting unmounted and dead for weeks. Never again.**
2. LINKAGE IS PART OF DONE. Every record links both ways to: `org.companies`, `mdata.loads`,
   `mdata.units`, `mdata.drivers`, `mdata.equipment` (trailers), `mdata.customers`, `mdata.vendors`,
   `catalogs.accounts`, `accounting.journal_entries`, `docs.files`, and the bank transaction where
   one applies. A block with no linkage declaration is NOT DONE.
3. NO HANDING OFF. Measure what blocks you, fix it, report what you fixed.
4. NO PATCHING. Root cause only. No report-only guards, no skips, no `--no-verify`, no bypasses.
5. NO DRIFT. Do not invent tables, concepts or names not in this document. If you believe something
   here is wrong, say so in ONE paragraph with the measurement that proves it, then do what it says.
6. NEVER write test, sample or demo rows into USMCA — including for proof.
7. USMCA ONLY: `5c854333-6ea5-4faa-af31-67cb272fef80`. Reads need BOTH lines:
   `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
8. Blank is blank. Unknown prints `—`. Never 0 for unknown, never a substituted value.
9. Every guard is REQUIRES_LIVE_DB. A guard that cannot connect is a FAIL, never a pass.
10. API keys are on the Desktop: `09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.md`
    (section 6 Google, line 188 `GOOGLE_PLACES_API_KEY`), `Apis-Google Maps.docx`,
    `IH35-RENDER-ENV-LIVE-2026-08-30.txt`. No seat may claim it lacks a key. Never print a key value.
11. Save your completion report to the repo at `claude/<date>-<SEAT>-<ROUND>-REPORT.md`. Cite live
    SQL for every claim. Never report DONE without pasted proof.
12. **NOTHING STAYS ON YOUR MACHINE.** Before you report anything, run `git status` and
    `git log origin/<your-branch>..HEAD`. If you have ANY committed-but-unpushed work, or uncommitted
    work that is complete: PUSH IT, MERGE IT, and make sure it DEPLOYS. Report the branch, the commit
    count that was sitting local, the PR, the merge SHA and the deploy id. Work finished and left on
    a laptop is not finished. If something is genuinely half-built, say so explicitly and say why.
13. **AUTO-DEPLOY IS OFF on both production services** (`IH35-TMS` backend `srv-d7rpem7avr4c73fhp4n0`,
    `ih35-tms-web` `srv-d7s46dbrjlhs7383i150`) — this is deliberate batching. A merge alone ships
    NOTHING. After merging, report the merge SHA and say "awaiting batch deploy"; the Lead fires the
    batch. Never claim something is live because it merged.

## PART E — YOU ARE UNBLOCKED, AND YOU WERE RIGHT
CC-1 `#23133` merged. `accounting.bill_payments` coverage went 0/130 → **98/130**. **Push your P0
`58e5356b11` now.** Never `--no-verify`, never force-post.
Your P2 finding corrected the Lead and prevented a real double-booking: those 130 are DRIVER BILLS
whose cash already posted through the settlement's payrun-close JE. On the record.
CC-1 also found something you should know: only 93 of the adopted bills carry a real JE uuid in the
memo; the other 130 carry the literal text "set-based". Matching is by `(load_id, driver_id)` to the
covering closed settlement. **32 genuine violations remain and are still correctly failing** — those
are real and belong to your surface with CC-1.

## PART F — ITEM 1: CHECK NUMBER RECONCILIATION, BEFORE ANYTHING PRINTS
`banking.check_number_registry` has 5 rows, ALL $1.00 proof checks to AMPARTS TRUCK & TRAILER,
numbers 1001-1005, all voided, `is_sample_data=false`. Zero real checks ever written; live expenses
with `payment_type='check'` = 0. Next real check is 1006.
Per Part C, a VOID keeps its number — so 1001-1005 stay consumed and are never reused. If the paper
stock starts at 1001, system and paper are five apart.
Report what `banking.check_stock_settings` says. Build an AUDITED one-time starting-number reset —
who, from what, to what, when, why — so the owner aligns system to paper himself. Guard reuse.

## PART G — ITEM 2: THE BILL PAYMENT ENGINE
A Check written to a payee with open Bills is a BILL PAYMENT, not an Expense. Recording it as an
Expense books the cost TWICE.
TABLES: `banking.bill_payments` (payee, bank_account_id, payment_type check|ach|wire|card|cash,
check_number, payment_date, total_cents, memo, journal_entry_id, print_batch_id) ·
`banking.bill_payment_applications` (bill_payment_id, bill_id, applied_cents, discount_cents,
credit_memo_id), UNIQUE (bill_payment_id, bill_id).
DATABASE CONSTRAINTS, not UI checks: applications sum to payment minus unapplied · no bill
over-applied · partial payment leaves the correct open balance · overpayment creates a vendor credit,
never a negative bill.
UI: selecting a payee loads that vendor's OPEN BILLS into a side panel — bill number, date, due date,
original amount, open balance. Ticking fills the applied amount, editable to a partial. Live
applied/unapplied figure. Saving with an unapplied balance asks ONCE whether the remainder is a
prepayment or an expense line and records the answer. No open bills = plain check, and it says so.
GL per Part B: posts when RECORDED, dated the payment date. Dr Accounts Payable, Cr bank. ONE
balanced JE per payment. Every application line traces to its bill.

## PART H — ITEM 3: BANK MATCHING IS A STATUS, NOT A POSTING
Every bill payment must be matchable against `banking.bank_transactions` and, once matched, carry the
bank transaction id both ways. **Matching sets CLEARED. It creates NO journal entry.** A payment that
cannot be matched is a defect, not a user problem. CC-1 is running the batch match; make sure your
payments are matchable by it.

## PART I — ITEM 4: THEN, IN ORDER
Re-measure your held stack (B5/B8/R218/R224) — state which item actually depended on CC-1 and which
was assumed; push everything that did not. Then **ROUND 140.3 — due 2026-09-24, now five days late**.
Then the Loves fuel statement object, the two-surface split, and the materiality threshold
distribution, each with measured options and one recommendation.

## LINKAGE
payment ↔ bill ↔ vendor ↔ unit ↔ load ↔ driver ↔ `docs.files` (the bill image) ↔
`accounting.journal_entries` ↔ `banking.check_number_registry` ↔ the bank transaction.

## GUARDS
`verify-check-number-never-reused.mjs` (voided included) ·
`verify-bill-payment-applications-never-over-apply.mjs` ·
`verify-check-to-vendor-with-open-bills-is-never-booked-as-expense.mjs` (**the double-booking guard —
most important**) · `verify-every-bill-payment-has-a-balanced-journal-entry-or-adoption-coverage.mjs`
· `verify-bill-payment-print-carries-check-number-and-stub.mjs` ·
`verify-bill-payment-is-bank-matchable.mjs`

## PROOF REQUIRED
A REAL bill payment by check against a REAL open vendor bill end to end — bill before, check created,
open-bills panel screenshot, application row, balanced JE, bill closed, A/P moving by exactly that
amount, bank match setting CLEARED with no new JE · a PARTIAL payment leaving the correct balance ·
the check-number reset audit row · live URL of the check form · every guard passing · your
`git status` and unpushed-commit report per Part D item 12.
Never write a test payment into USMCA — use a real bill and a real amount, or ask for a ruling.
