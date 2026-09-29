# ROUND 263 — DEVIN-B — YOUR AUDIT CORRECTED ME TWICE. NOW CLOSE THE BREAKS.

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

## PART E — ACCEPTED, AND YOU WERE RIGHT ON TWO OF MY NUMBERS
Your 7-chain audit is the most useful document produced tonight. Two corrections stand:
- **Odometer readings: I measured 0, you measured 177,906.** You were right. Devin-A then found they
  were sitting unused in `telematics.vehicle_locations.odometer_mi`. My count was true at the moment
  I took it and stale minutes later; yours was current. Yours is the figure of record.
- **Truck-line board returns 14, not 11.** The owner SEES 11 on screen. That means the gap is in
  rendering or filtering, not the query — a materially different defect than I had assigned. Routed
  to Cursor with your finding.
One correction the other way: **stops. You measured 321/354, I measured 349/382.** You scoped to 136
loads; the full USMCA set is 149 loads / 382 stops. Both internally consistent — **349/382 is the
figure of record.** No fault; state the scope next time and it is unambiguous.
And the finding that matters most: **the truck-line board uses a private status list at line 257**
while trip-pairing correctly uses `assertCanonicalSubset`. That is the root cause of the board
divergence. Cash flow (`GL batch_status`) and the pre-settlement link also carry private filters.

## PART F — ITEM 1: RECONCILE THE FARO COUNT WITH ME
You measured **24 invoices sent and not in Faro**. I measured **15** by searching the Faro CSVs in
`~/Downloads` for load numbers, and separately found **5 loads — 13503, 13504, 13509, 13533, 13539 —
present in `FARO-IH-35-Transportation-export-16/17/18.csv` and `faro_canonical_purchases.csv` under
IH 35 TRANSPORTATION**. You reported 0 cross-entity loads.
Both can be true: the evidence is in the FARO FILES, not in a DB column — there may be no
cross-entity flag in the database at all, which is itself the finding.
Produce the definitive reconciliation: for every USMCA invoice with `factoring_status` not advanced,
is that load present in ANY Faro file, and under WHICH entity's export? One row per invoice, with the
file name it was found in or "not found in any Faro file".

## PART G — ITEM 2: CHAIN 2 IS THE BIGGEST BREAK IN THE SYSTEM
Your own numbers: **0 of 136 loads have a rate confirmation** and **0 of 153 invoices are in Faro**
on chain 2 (load → ratecon → invoice → factoring → cash). Yet `docs.files` holds 18 rate
confirmations and `accounting.invoices` shows 95 advanced. So the CHAIN is broken even where the
DATA exists — the links are missing, not the documents.
Map exactly where the link is absent: is it `docs.files.dispatch_load_id`, a missing join table, or a
category not being set on upload? Name the column that should carry the link and does not.
This is the chain the whole factoring flow depends on. FIND IT AND FILE IT.

## PART H — ITEM 3: THE REMAINING BREAKS, QUANTIFIED
- Chain 3: 50 loads with no fuel; **424 expense lines with no load**. Which expenses, what dollars,
  and can they be attributed?
- Chain 4: 81 loads with no settlement; **22 bills unlinked**. Which bills?
- Chain 6: 15 loads not linked to a pre-settlement; 3 lines with no load.
- Chain 7: 134 loads with no downtime event — expected, not a defect, but say so explicitly so
  nobody later reads it as one.
For each: the count, the dollars, and whether the link is recoverable from existing data or genuinely
absent.

## PART I — ITEM 4: PUSH YOUR HELD BRANCH
6 commits on `devin-b/readonly-gate-bypass-defect` have been sitting local. The moment CC-3's ROUND
234 lands, push, merge, and report the SHA. Per Part D item 12 — finished work left on a machine is
not finished.

## PROOF REQUIRED
The Faro reconciliation, one row per unfactored invoice · the named column breaking chain 2 · counts
and dollars for every remaining break · your push SHA.
