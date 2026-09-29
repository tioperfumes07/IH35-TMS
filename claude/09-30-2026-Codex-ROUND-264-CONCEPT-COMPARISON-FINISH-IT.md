# ROUND 264 — CODEX — YOU WERE RIGHT NOT TO FABRICATE. NOW FINISH THE COMPARISON.

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

## PART E — ACCEPTED, AND YOUR REFUSAL WAS CORRECT
Your measured results: 87 company PDFs read, 76 in scope, 11 excluded · 73 driver PDFs, 63 in scope,
10 excluded · live range 5769–5816 · UNKNOWN/N-A rows **0** · out-of-range **0** · driver tab
**47 green, 1 red** (5812, the known header-vs-GL defect).
You wrote: *"I did not fabricate green results. The requested all-green self-check does not match
current live data."* **That was the right call and I am withdrawing that self-check.** I wrote it
expecting the driver tab; on the company tab an all-green requirement would have been an instruction
to produce a fake green, which is the one thing we never do. My instruction was wrong. Yours stands.

## PART F — ITEM 1: THE COMPANY TAB — 48 RED. NOW PROVE WHICH ARE REAL.
48 red from measured concept amount differences is a legitimate result, not a false red — but a count
is not a finding. **Group them and rank them, or it cannot be acted on.**
Report, ranked by count and by dollars:
1. **Concept and quantity match** — green.
2. **Transportation-shared** — AlwaysTrack shows a load we correctly do not. Owner: *"ours will show
   1 load with 2K in expenses while AlwaysTrack shows 2 loads with 2K."* Match on the USMCA subset,
   report the AlwaysTrack-only load in its own column, and **do NOT mark the settlement red for it.**
3. **AUTH-089 class** — app total LOWER than AlwaysTrack by exactly one repeated charge. The APP is
   wrong here, not AlwaysTrack. Proven on 5787: AlwaysTrack `EXPENSES total: 140.20` vs our live
   124.95, the difference being one $15.25 scale charge voided in error. CC-1 is reinstating it.
4. **Wrong-load-split** — same settlement total, expenses on the wrong load. On 5787, load 13555 has
   ZERO non-diesel expenses live while the document assigns it several.
5. **Genuine differences** — everything else. These are the ones that need a human.
Give the count and the dollars for each class. A single class explaining 30 of the 48 is a finding;
48 individual rows are not.

## PART G — ITEM 2: NORMALISATION RULES, EXPLICIT
Strip `$` and thousands separators, parse to cents, take ABSOLUTE VALUE so `Deductions: -60.00` and
`$60.00` are the same magnitude, and match line items by **LOAD NUMBER and CONCEPT — never by
position**. AlwaysTrack line 1 being load 13498 while the app's line 1 is load 13508 is the same data
in a different order, not a mismatch.
Compare per load and per settlement: line haul · driver pay · extra pay · fuel · expenses · repairs ·
margin.

## PART H — ITEM 3: THE 5782 PROVENANCE
You used a flat Downloads copy for company 5782. Say where that file came from and whether it is the
same document as the one in the PDF set. A source that cannot be named cannot be accepted.

## PART I — ITEM 4: THE DRIVER TAB IS CLOSED
47 of 48 tie. Do not rework it. 5812 is the known defect.

## PROOF REQUIRED
The five class counts with dollars · total absolute variance per tab · the 5782 provenance · the
workbook in `~/Downloads` · your `git status` and unpushed-commit report per Part D item 12.
