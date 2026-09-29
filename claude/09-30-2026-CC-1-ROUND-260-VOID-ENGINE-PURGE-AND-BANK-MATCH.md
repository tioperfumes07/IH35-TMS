# ROUND 260 — CC-1 — REBUILD THE VOID ENGINE, PURGE, POST, AND BATCH BANK-MATCH

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

## PART E — ROUND 251 ITEM 1 ACCEPTED, AND YOU CORRECTED ME
`#23133` merged and is deploying. Coverage went 0/130 (0.0%) → **98/130 (75.4%)**, with **32 genuine
violations still failing**, not hidden. CC-2 and CC-3 are released.
You also caught my instruction being wrong. I told you to parse the JE uuid from the bill memo. You
verified live first and found only 93 bills carry a real uuid while the other 130 — the set-based
cohort — carry the literal text "set-based" with no uuid at all, so **a memo-parse would have missed
the entire cohort I was trying to fix.** Matching on `(load_id, driver_id)` against the covering
closed settlement works for both. You were right, I was wrong, and it is on the record.
The 32 remaining bill_payment violations are a real finding and stay open as your follow-up.

## PART F — ITEM 1: REBUILD THE VOID ENGINE TO THE RESEARCHED STANDARD
Part C above is the standard, taken from Intuit's own documentation, not from memory. Build to it.
INSPECT the existing detector, ANALYSE what it actually did, then REBUILD. Do not patch.
The AUTH-089 failure is the worked example: it keyed on `(load, amount)`, so two different vendor
invoices — Pilot scale 6232741 on 08-20 and Flying scale 1106179 on 08-25, both $15.25 on load
13549 — were treated as one purchase and a real charge was destroyed. Of the voided rows carrying a
document number, **10 of 10** had no surviving row with that document. $132.50 gone.
Every void carries WHO · WHEN · WHY from a catalog · the exact superseded row · the reversal JE.
Guard: `verify-no-transaction-is-orphaned.mjs` — every expense, bill, bill payment, invoice, receive
payment and fuel transaction sits in exactly ONE terminal state. Ratchet to 0.

## PART G — ITEM 2: REINSTATE BEFORE YOU DELETE ANYTHING
The 10 documented AUTH-089 rows, starting `13549-19` doc 6232741 $15.25. Use `reinstated_at` /
`reinstate_reason` / `reinstated_from_void_je_id` / `status_before_void`. The 77 with no document
number go to `accounting.expenses_review_queue` — never auto-reinstated, never purged.

## PART H — ITEM 3: POST THE DRAFTS, AND ANSWER THE OWNER'S QUESTION
The owner asked: **"what do you mean they never approved, WHERE?"** Answer it with evidence. Name the
exact path that moves an expense out of `status='draft'` — a UI action, a batch job, or nothing at
all. If no approval path exists in the app, that IS the finding and you build it.
Per Part B, posting does NOT wait for bank matching. MEASURED: 296 posted, **0 bank-matched**; 257
drafts, **0 bank-matched**. Matching is not what is holding them.
WHAT THEY ARE: 177 Fuel-DEF $5,811.04 · 18 Driver Reimb-Scale $234.50 · 15 OTR-Scale $208.75 ·
11 Reefer-Trailer Washout $527.13 · 9 Warehouse Lumper $1,778.10 · 7 Fuel-Reefer-Diesel $740.18 ·
3 Road Service-Trailer Tire $1,805.55 · 3 Road Service-Truck Repair $679.79 · 2 Road Service-Truck
Tire $1,616.06 · plus washouts, tolls, parking.
Post today's live re-verified clean set in ONE batch: one `posting_batch_id`, one balanced JE each,
account from the line's `item_id`, correct class and date, linked both ways, `idempotency_key` per
row. `is_sample_data` stays false.

## PART I — ITEM 4: BATCH BANK-MATCH EVERYTHING YOU CAN. OWNER ORDER.
Owner: *"match in a single batch all those expenses that you could match, and I would match the rest
myself."*
Run ONE batch match of posted documents against `banking.bank_transactions` (937 rows). Match on
amount AND date within the owner-locked cascade — **Step 1 −3/+1 days, Step 2 −7/+2 days, auto-widen
ONLY on zero, never past Step 2** — plus vendor/payee where available. Write to
`banking.reconciliation_matches` with `ledger_entry_kind`, `ledger_entry_id`, `match_score`,
`match_state`, `matched_at`. **A match sets CLEARED status only. It creates NO journal entry.**
Only auto-match where it is unambiguous: exactly ONE candidate. Anything with 0 or 2+ candidates is
left for the owner, listed by document with its candidates. Report auto-matched count, left-for-owner
count, and the dollars in each.

## PART J — ITEM 5: THE PURGE (owner order, overruling the freeze)
ARCHIVE FIRST into `archive.purged_2026_09_30_*` — full rows, `purged_at`, `purged_by`, counts
matching source. The archive IS our audit log, which is exactly what QBO's delete does.
PROVEN SAFE: all **790** void pairs verified line by line — original debit equals reversal credit
and vice versa on 790 of 790, **$0.00 not offsetting**. Deleting both sides moves no balance.
DELETE in order: `journal_entry_postings` → `journal_entries` → voided expenses → voided invoices.
EXEMPT: anything reinstated in Item 2, and the 77 review-queue rows.
THE 5 CROSS-ENTITY LOADS: 13503, 13504, 13509, 13533, 13539 appear in Faro's
`FARO-IH-35-Transportation-export-16/17/18.csv` and `faro_canonical_purchases.csv` under IH 35
TRANSPORTATION, yet carry USMCA invoices flagged not_factored. **Devin-B's DB audit found 0
cross-entity flags — so the evidence is in the Faro FILES, not in a DB column.** Verify each against
the file, then hard-delete the USMCA invoice and load with full archive and full linkage cleanup —
stops, expenses, settlement links, `docs.files`. Nothing orphaned.
PROVE NOTHING MOVED: trial balance · P&L by account · balance sheet · A/R and A/P aging · bank
balances — BEFORE and AFTER, identical. One cent of movement = ROLL BACK.

## PART K — ITEM 6: THE 15 INVOICES NEVER SENT TO FARO
13498, 13513, 13517, 13525, 13527, 13540, 13541, 13555, 13572, 13578, 13582, 13595, 13609, 13616,
13621. Devin-B measured **24** sent-but-not-in-Faro, more than my 15 — reconcile the two counts and
report the true list. Find why submission never fired and WIRE IT PERMANENTLY. Load 13525 also has a
$0.00 invoice marked sent — find out what it is.

## PART L — ITEM 7: KILL THE WALL-CLOCK GATE
Replace the 7-day rolling window with a fixed ratcheted population count. Your own analysis is now
standing law: **no blocking guard derives its verdict from wall-clock time.** Guard:
`verify-no-money-gate-depends-on-wall-clock-time.mjs`.

## PROOF REQUIRED
The named approval path · archive counts · reinstated rows with JE ids · posted count and batch id ·
bank-match auto/left-for-owner counts and dollars · void count 0 · the 5 loads gone with archive
proof · BEFORE/AFTER balances identical · 5787 non-diesel total = **140.20** · every guard passing ·
your `git status` and unpushed-commit report per Part D item 12.

---
# AMENDMENT — VOID ENGINE METHOD. I CORRECTED MY OWN INSTRUCTION. READ BEFORE BUILDING.
Part C told you to build to QuickBooks' standard. That is right for the WORDS and wrong for the GL
MECHANICS. Full research in `claude/09-30-2026-LEAD-VOID-ENGINE-RESEARCH-QBO-NETSUITE-MCLEOD-ALVYS.md`.

**QuickBooks voids by ZEROING the transaction in place, on its original date.** If that date is in a
closed period, the closed period's totals move. Wrong for us.

**NetSuite ("Void Transactions Using Reversing Journals") leaves the original at its full amount,
marks it Voided, and creates a SEPARATE reversing journal entry DATED ON THE VOID DATE**, linked by
"Void Of" / "Voided On". Oracle states this exists specifically so a void never alters a closed
period. After voiding, NO GL-impacting change to the original is allowed, including its posting
period.

**WE ARE ALREADY BUILT THE NETSUITE WAY — DO NOT REPLACE IT.** `accounting.expenses` already has
`journal_entry_id`, `reversed_by_je_id`, `voided_at`, `void_reason`, `status_before_void`,
`reinstated_from_void_je_id`. And I verified all **790** void pairs offset perfectly, $0.00 not
offsetting. The model works. Rebuild the DETECTOR (the duplicate-identity logic that AUTH-089 got
wrong); do NOT rebuild the void mechanics away from reversing journals.

ADD, enforced in the database:
- After `voided_at` is set, no update may change the original row's amount, accounts, or posting
  period. Reject it at the DB level, not in the UI.
- The reversing JE is dated the VOID date, never back-dated to the original.
- The transaction NUMBER is retained on void — a voided check keeps its number.
Guard: `verify-void-never-alters-the-original-or-its-period.mjs` — REQUIRES_LIVE_DB, ratchet to 0.
