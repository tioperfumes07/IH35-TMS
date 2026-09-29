# ROUND 259 — CURSOR — CLOSE THE DEPENDABOT PRs, THEN FIX MAIN CI, THEN THE LOAD BOARD

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

## PART E — ITEM 1: CLOSE THE 7 DEPENDABOT PRs. OWNER AUTHORISED.
PRs **#22980 #22981 #22982 #22983 #22984 #22985 #22986** are dependabot dependency bumps. The owner
has authorised closing them out. Each one also spawned a Render preview static site
(`ih35-tms-web PR #2298x`, service ids `srv-dat5hh2vcj2c73bfecjg`, `srv-dat5i4c9v7es73fkkdfg`,
`srv-dat5jnbncjis73f4jqo0`, `srv-dat5jrbncjis73f4k0tg`, `srv-dat5jvbl550s739tdu9g`,
`srv-dat5k2bl550s739tdvt0`, `srv-dat5k5bncjis73f4kmc0`) with **autoDeploy ON**, consuming build
capacity while the two real services sit idle.
Close the PRs and delete their preview services. Report each PR number and each service id removed.
Do NOT merge them — they are unreviewed dependency bumps against a red main.

## PART F — ITEM 2: MAIN CI IS RED. THIS IS NOW A GLOBAL BLOCKER.
Devin-A reports main failing on a migration foreign key:
`blocked_feature_flags_blocked_by_user_id_fkey`. Every seat's push and all 7 dependabot PRs are
behind it. Root-cause it: which migration, what the FK references, why it fails, and whether the
referenced table or column is missing, renamed or out of order. Fix the migration properly — not by
dropping the constraint, not by marking it applied. Report the migration number and the exact error.

## PART G — ITEM 3: THE LOAD BOARD. DEVIN-B'S AUDIT CHANGES THE PICTURE.
Devin-B measured the truck-line board returning **14**, not 11. The owner sees **11** on screen and
counts **16** running. The database says **14 dispatched**. So there are now three separate questions
and you answer all three, measured:
  a. Why does the owner see 11 when the board query returns 14? Rendering, filter, pagination, or a
     row swallowed by grouping — name it.
  b. What are the owner's 2 extra loads that the database does not show as dispatched?
  c. Devin-B found the truck-line board uses a **private status list at line 257**, while the
     trip-pairing board correctly uses `assertCanonicalSubset`. That divergence is the root cause.
     Route the truck line through the canonical active-load definition, the same one trip-pairing
     already uses. Cash flow (`GL batch_status`) and the pre-settlement link also have private
     filters — report those, fix the truck line.

## PART H — ITEM 4: EVERYTHING ELSE ON THE BOARD, UNCHANGED
Unit may appear TWICE when row 2's PU date equals row 1's DELIVERY date — that is the RETURN TRIP.
Never de-duplicate; chain row 2 to row 1. · The unit after **176** shows no unit — fix and name the
cause. · Column order exactly: **UNIT · PRE-SETTLEMENT/TOUR · LOAD · PU DATE · DELIVERY DATE ·
[TRANSIT LINE]**, line begins under LOAD. · Transit line: truck **GREEN**, **ANIMATED with smoke**,
line **CENTRED**, truck **DRAGGABLE** to change status in transit → on time → at delivery →
delivered, **CURRENT LOCATION** after the line. Find the commit where this worked and diff it. ·
Row height too tall. · Status dropdown opens **under that load's row**. · **Universal combo filter
box** across unit, driver, customer, status, tour number, date range. · **Responsive width** — no
horizontal page scroll at any width, tables get their own `overflow-x:auto`, text wraps; fix dispatch
then report which pages outside your lane still fail.

## LINKAGE — the board is a chain, not a view
load ↔ unit ↔ driver ↔ trailer ↔ customer ↔ stops (with coordinates) ↔ tour / pre-settlement ↔
invoice ↔ settlement ↔ `docs.files`. Every row resolves all of it, both directions.

## GUARD
`verify-truck-line-board-shows-canonical-active-set.mjs` — REQUIRES_LIVE_DB. Board row count equals
the canonical active-load count from the SAME shared definition trip-pairing uses. Column order
asserted. A unit with a return trip renders TWO rows.

## PROOF REQUIRED
The 7 PR numbers closed and 7 service ids deleted · the migration number and exact FK error, then
green main · the answer to 11 vs 14 vs 16 · the truck line routed through the canonical set · live
URL showing column order, green animated truck, return trip as two rows, per-load dropdown,
universal filter · the board at a non-maximised width with no horizontal scroll · the guard passing.
