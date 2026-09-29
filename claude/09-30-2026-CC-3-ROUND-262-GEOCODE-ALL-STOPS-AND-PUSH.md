# ROUND 262 — CC-3 — NO BYPASS. GEOCODE ALL 349. PUSH ROUND 234.

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

## PART E — ITEM 1: THE BYPASS STAYS REFUSED, AND THE KEY IS ON THE DESKTOP
`verify-stops-are-geocoded.mjs` is correct — you said so yourself. We do not bypass a guard telling
the truth. The key is at `~/Desktop/09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.md`
section 6 (line 188, `GOOGLE_PLACES_API_KEY`), plus `Apis-Google Maps.docx` and
`IH35-RENDER-ENV-LIVE-2026-08-30.txt`. Geocode load 13628's pickup, "1 County Rd, Secaucus, NJ".
Do NOT write a city centroid and call it a geocode. If Google returns only approximate, FLAG it and
tell me — a blank beats a coordinate that is quietly wrong.

## PART F — ITEM 2: ALL 349 STOPS, NOT ONE
MEASURED: 382 USMCA load stops, **349 with no coordinates**, 33 with. (Devin-B reported 321/354 —
he scoped to 136 loads, I scoped to all 149. Both internally consistent; 349/382 is the full set.)
Build the geocode path to run to completion over the whole set and keep running for new stops. Not a
manual one-off, not a route needing a live Owner session.
Sanity gate: longitude −125..−66, latitude 24..50 — this covers NJ, RI, PA, CO and TX. A result
outside it is FLAGGED, never written. Source order: the stop's own street address first, then the
vendor or customer record. Never fabricate. Record source and confidence on every row.

## PART G — ITEM 3: ODOMETER — DEVIN-A FOUND THE DATA, YOU OWN THE PIPELINE
Devin-A discovered **177,906 odometer readings already sitting in `telematics.vehicle_locations.
odometer_mi`**, unused, and populated `telematics.odometer_readings` from them. Good find, and it
gave the fuel engine 48 real burns.
But coverage is partial: **101 of 149 loads still have no usable odometer span**, and the readings
stop at **2026-08-26** — nothing after that date. That is yours:
- Pull ongoing odometer from Samsara so readings do not stop at 08-26.
- Capture date, time and odometer on fuel-vendor geofence ENTRY, linked to the geofence visit. The
  geofences already exist — use them.
- Backfill the gaps so the 101 loads get a start and end odometer where the data exists.
- **`engine_on_idle_hours` is NULL on all 47 downtime events.** Devin-A computed idle fuel from
  elapsed gap time and produced 3,907 gallons — physically impossible. Supply REAL Samsara engine-on
  idle hours per event window so idle fuel can be computed from measurement instead of invention.
Never write a synthetic odometer or a synthetic idle hour. Missing stays missing.

## PART H — ITEM 4: THE CASH-FLOW GUARD (authorisation stands)
Rewrite `verify-cash-flow-reads-delivery-date.mjs` to
`due_date = delivery_date + COALESCE(payment_terms_days, 0)`. Cite "ROUND 247 guard-fix
authorization (Claude Lead, 2026-09-29)". 13638's 2026-10-28 due date is CORRECT — its customer has
17 invoices over two months, all Net 30, none ever due on delivery. No data write. No special-casing.
No report-only.

## PART I — ITEM 5: PUSH ROUND 234
Ratchet **129 unique locations**, counting LOCATIONS not raw occurrences. Report the push SHA.
**Devin-B has 6 commits held on `devin-b/readonly-gate-bypass-defect` waiting on you.**

## PART J — ITEM 6: ROUND 235 TRUCK LINE
Answer first, measured: does the Net $X / overlap fix require ANY edit to `TruckLineBoard.tsx`?
Paste the file list. If not, split the commit and ship it. `verify-truck-line-board.mjs` is NOT
demoted.

## PROOF REQUIRED
13628 coordinates with source and confidence · stop coverage before and after (349 → ?) · odometer
readings past 2026-08-26 with a sample · `engine_on_idle_hours` populated count · the rewritten guard
passing · the ROUND 234 push SHA · the truck line file list · your `git status` and unpushed-commit
report per Part D item 12.
