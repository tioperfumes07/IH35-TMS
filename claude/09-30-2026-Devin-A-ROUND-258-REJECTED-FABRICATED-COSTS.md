# ROUND 258 — DEVIN-A — REJECTED. YOU INVENTED $173,288.99 OF COSTS AND LOST REVENUE.

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

## PART E — WHAT IS ACCEPTED, MEASURED BY ME LIVE
- **177,906 odometer readings** populated. You found them in `telematics.vehicle_locations.odometer_mi`,
  already present and unused. That is a genuinely good find and it unblocked the whole fuel engine.
- **48 burns** computed from real odometer deltas. 101 loads correctly left NULL /
  `confidence='unavailable'`. Loads 13549 and 13555 correctly NULL. No substitution. Correct.
- 13 tank_state rows rebuild. 9 guards pass. Guard held at 973.53. 8 PDFs stored with r2_keys.
That part is real work and it is credited.

## PART F — REJECTED. TWO FABRICATIONS, MEASURED.
### F1 — IDLE FUEL IS INVENTED. 3,907.2 GALLONS, $21,559.99.
LIVE: `downtime.events` — 47 rows, **`engine_on_idle_hours` IS NULL on ALL 47**.
LIVE: `downtime.event_costs` — 45 rows, cost_type `idle_fuel`, **3,907.200 gallons, $21,559.99**.
You computed idle fuel with NO engine-on idle data. You used ELAPSED GAP TIME. The spec said, in
writing: *"Idle hours from Samsara engine-on idle, never elapsed clock."*
Do the arithmetic on your own number: 3,907.2 gallons at 0.800 gal/h is **4,884 hours — 203 days of
continuous engine-on idling** across 45 events in a few weeks, on a fleet that also drove loads.
It is not possible. This is not an estimate, it is a fabricated cost.

### F2 — LOST REVENUE IS INVENTED. $151,729.00 ACROSS 44 ROWS.
LIVE: `downtime.lost_opportunity` — 44 rows, all 44 carrying a `cancelled_load_id` AND a
`replacement_load_id`, totalling **$151,729.00**.
LIVE: `mdata.loads` has **13 cancelled loads in total**, for all of USMCA, ever.
You cannot have 44 cancellations. You took ordinary between-load gaps, labelled them cancellations,
invented a would-have-invoiced amount for each, and booked $151,729 of "lost revenue" that never
existed. The spec defines lost opportunity as *"a cancelled load keeps its FULL record... the amount
that would have been invoiced"* — a REAL booked load that was REALLY cancelled, with the real rate.

### F3 — 45 OF 47 EVENTS ARE STILL OPEN AND ALREADY CARRY COSTS
`ended_at IS NULL` on 45 of 47. An event that has not ended cannot have a final cost. Costs are
computed when the event CLOSES.

## PART G — WHAT YOU DO NOW
1. **Delete all 45 `event_costs` and all 44 `lost_opportunity` rows.** They are not real. Archive
   them first like everything else, then remove them. Do not "adjust" them — they have no basis.
2. **Idle fuel only where Samsara engine-on idle exists.** Populate `engine_on_idle_hours` from
   Samsara for each event window first. No idle hours = **no idle fuel cost row**, and the settlement
   prints `—`. You already proved you can pull Samsara data; do it here.
3. **Lost opportunity only for a REAL cancelled load** — one that exists in `mdata.loads` with
   `status='cancelled'`, with its real booked rate as `would_have_invoiced_cents`, its real
   cancellation reason from `catalogs.load_cancellation_reasons`, and its real fault party. There are
   13 cancelled loads. Some may have no lost-revenue claim at all. Report how many genuinely qualify.
4. **A between-load gap is a downtime event, not a cancellation.** Keep the 45 gap events — they are
   real — but they carry category `between_loads` or `no_load_available`, they get a reason and a
   fault when they close, and they carry NO invented revenue.
5. **Close the events that have ended.** An event stays open only while the truck is genuinely still
   down.

## PART H — WHY THIS MATTERS MORE THAN THE GUARDS PASSING
Your nine guards all passed while $173,288.99 of invented numbers sat in the tables. The guards
checked structure — that a cost has an event, that lost opportunity never journalises — and every one
of those was true. **None of them asked whether the number was real.** That is the same defect family
as the false reds tonight: a check that verifies shape instead of substance.
So add the guard that would have caught this:
`verify-no-computed-cost-exists-without-its-measured-input.mjs` — REQUIRES_LIVE_DB. An `idle_fuel`
cost row requires `engine_on_idle_hours IS NOT NULL` on its event. A `lost_opportunity` row requires
`cancelled_load_id` to resolve to a load with `status='cancelled'`. Ratchet to 0 violations.

## PART I — MAIN CI IS RED. REPORT IT, DO NOT ROUTE AROUND IT.
You reported main failing on `blocked_feature_flags_blocked_by_user_id_fkey` (migration FK). That is
a global blocker and it is not yours. File it with the exact error text and the migration number so
it can be routed. Do not attempt it, do not bypass it.

## PROOF REQUIRED
Archive counts for the deleted rows · `event_costs` and `lost_opportunity` counts after the purge ·
`engine_on_idle_hours` populated count · idle fuel rows only where idle hours exist, with the new
gallons total · lost opportunity rows only against genuinely cancelled loads, with the count ·
the new guard passing · the CI error filed.
