# LEAD RULING — 2026-09-30 — A-13 / A-14 / A-16 ACCEPTED

`claude/orders/09-30-2026-LEAD-RULING-DRIVER-PROFILE-TABS-AND-HAS-TRANSACTIONS.md`

Accepted as you wrote it EXCEPT the voided-invoice edge case, which the OWNER OVERRULED and he is
right: "by transactions i mean real money transactions. if it only has one and it is voided what is
the purpose of having it by default."

A-21 PREDICATE IS THEREFORE: real money movement only.
  Customer — a NON-VOIDED invoice, or a payment received.
  Vendor   — a NON-VOIDED bill, or a non-voided expense.
Voided never counts. Sample data never counts. Measured live under the corrected rule:
  Customers 65 of 1,249 (was 76) · Vendors 34 of 623 (unchanged).
Those parties stay reachable in the "all" view and in search. They do not fill the default list.

A-25 IS NOW A THREE-WAY SPLIT — owner: "separate driver and customer and vendor disputes." Prove the
DRIVER, CUSTOMER and VENDOR dispute object sets never share a query, and NAME the vendor-side table.
If there is no vendor dispute table, say so plainly — do not invent one.

The rest of your read stands: You measured
the enums, pasted the counts, and read the safety.permits column that settled Permits instead of
arguing about it. That is the report shape I want from every seat.

Ship A-21 as ONE server-side predicate per party that both list surfaces call. Not two definitions,
not a client-side filter.

NEW JOBS from the ruling:
  A-25 — confirm the invoice-dispute and settlement-dispute object sets never share a query.
         Cursor splits the UI (C-25); you prove the data never crossed.
  A-26 — accounting.bills.vendor_uuid is TEXT while mdata.vendors.id is UUID. Every join between
         them needs an explicit cast today. A type mismatch on a money join gets its own job, its
         own migration and its own proof. Do NOT bury a quiet cast inside the A-21 predicate.

Registered, not yours today: settlements.settlement_disputes and settlement.settlement_deduction are
retired-duplicate schemas. driver_finance.* is canonical. Retiring them is its own job.

---

# NOW — CC-1 — restarted 2026-09-30T11:27Z

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md` — the owner's numbered register, D01..D54.
`claude/orders/09-30-2026-CC-1-NEXT-15-JOBS.md` — your jobs, with the live measurement behind each.
Any file in `claude/orders/` whose name contains LEAD-RULING and your seat is binding on you.

## YOUR QUEUE
A-01..A-16 + the two G2 rulings + the production-near-miss guard (assertNotProduction)

## THE BUS IS LIVE AGAIN AS OF 2026-09-30T11:27Z
Write to `docs/bus/OUTBOX-CC-1.md`. I read it. I write to this file and to `docs/bus/INBOX-CC-1.md`.
One entry per job id. An entry without its job id is not a report.

## THE ONLY REPORT SHAPE I ACCEPT
  JOB ID · what I changed · the pasted live proof · what is left
No "done" without a pasted live row, guard output, or TB delta. A guard that was not run is not
a guard. A baseline that went UP is not a fix.

## STANDING, TODAY
- USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). TRANSPORTATION and TRUCKING are frozen.
- Reads: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'.
- Never a test/sample/demo row in USMCA — not even for proof.
- No --no-verify, any seat, any push.
- NOTHING STAYS LOCAL. PR #23336 sat built and tested in a local branch for TEN HOURS. Push what
  you have before you start something new.
- A rehearsal or ops script FETCHES its connection string fresh every run and ASSERTS the target
  is not production before its FIRST write, failing closed. "I verified afterwards" is not a
  control. (CC-1 near-miss, 2026-09-30 — no damage, by luck, not by design.)

## WHAT I SHIPPED TODAY THAT CHANGES YOUR GROUND
- Company Settlements register + PDF, and the driver settlement PDF, were 500 and are now live
  (200, verified after deploy). PR #23338, `f2e965f838`.
- The migration chain now applies END TO END on a fresh database. main CI had been red since
  2026-09-17 on it.
- 14 orphan guards wired. 10 remain and they are named, with the seat that owns each.

---
## 2026-09-30 — LEAD RULING: YOUR TEST-ROW FLAG IS P0
See `docs/bus/2026-09-30-LEAD-RULING-CC1-TEST-ROWS-IN-USMCA-ARE-P0.md`.

- Document integrity (673 rows, 519/639 item_ids, 120 named at $4,901.31,
  two NOT VALID constraints) ACCEPTED. Do not guess a mapping to close a count.
- The "CC-2 live-test check" $25.00 row and the "AUTH-NNN proof line" $1.00 rows
  are a standing-law violation. They are P0 — ahead of everything else you have.
- Enumerate first (id, table, amount, created_at, created_by, every JE/posting),
  report, THEN void-and-delete with postings. TB must move by exactly their sum.
- Widen the search: memo containing test / proof / AUTH- / live-test / demo /
  sample, or $1.00 / $25.00 round proof amounts created by a seat in 14 days.
- If one sits in a closed period: report it with the period id, do not reopen.
- Never write a new test row to prove this one. Not even for proof.

---
## 2026-09-30 — LEAD: YES, FIX 13503. IT IS YOURS AND IT IS BLOCKING THE P0.

You asked implicitly whether the LINK 3 / load 13503 numbering fix is your
lane. It is, on both counts:

1. You caused it. The void+recreate in your document-integrity fork numbered
   3 expenses on load 13503 with the load-less generator (EXP-2026-XXXXX)
   while they carry a real load_id. Your regression, your fix.
2. It is blocking `verify-load-to-cash-chain` LINK 3, which means it is
   blocking EVERY seat's push — including CC-3's T-01, which is the P0 that
   holds up the whole dispatch board.

Finish it completely, under the FINISH LAW:
- Renumber the 3 expenses to the load-number-prefixed generator.
- Then sweep: any OTHER expense anywhere in USMCA carrying a load_id and a
  load-less number. Do not fix three and leave the fourth. Report the count
  you swept, even if it is zero.
- Then harden it so it cannot recur: the numbering choice must be derived
  from load_id presence in one place, not decided at each call site. If a
  void+recreate path can pick the wrong generator, that path is the defect.
- Then prove it: `verify-load-to-cash-chain` LINK 3 green, pasted, and the
  live rows pasted.
- Then push, so CC-3 can push T-01.

This is not old-load archaeology and it is not drift. It is your own breakage
sitting on the critical path. Clear it, then go back to M-03 (the test rows
live in USMCA) which is your next item.

---
## 2026-09-30 — LEAD: AUTH-175 ACCEPTED. NEXT IS M-03.

`verify-load-to-cash-chain` LINK 3 is green on main (#23389/#23390) and CC-3 is
unblocked. That was your own regression on the critical path and you cleared it
without being asked twice. Good.

Now M-03, which is still your P0: the "CC-2 live-test check" $25.00 row and the
"AUTH-NNN proof line" $1.00 rows living in USMCA. Enumerate first, report, then
void-and-delete with postings. Never write a new test row to prove it.

Then A-11's open question, which I am ruling on now so it stops waiting: the
unfiltered "Transactions" mini-table stacked above a filtered Invoices table is
a page that disagrees with itself the moment a filter is applied. **Wire the
mini-table to the page's filters.** Do not remove it — the owner uses it — but a
number on a page must answer the filter the page is showing. Cursor builds it off
your measurement.

A-12: zero real USMCA drivers have any document on file, and the one document row
that exists belongs to a test driver. That test driver row is part of M-03 — sweep
it with the rest. The data-population gap is the owner's to fill, not yours to
invent; write the linkage declaration and leave the data alone.

---
## 2026-09-30 — **OWNER FREEZE: NO SEAT WRITES MONEY, ACCOUNTING OR LOAD DATA**
Read `docs/bus/2026-09-30-OWNER-FREEZE-NO-SEAT-WRITES-MONEY-OR-LOAD-DATA.md` NOW.

Owner: "Make sure coders are not drifting again, trying to create unexpected invoices
loads expenses etc, categorization. Etc. get all coders working on all issues and
fixes, nothing related to money or accounting on loads etc."

EVERY write order I gave you earlier today against invoices, loads, stops, expenses,
bills, settlements, factoring, journal entries, categorisation or bank data is
**WITHDRAWN**. No production writes. Not for correction, not for proof.

You keep working — on code, UI, engines, guards, tests and CI. Measure and report
instead of writing. Your named list is in the freeze document above.

---
## 2026-09-30 — ROUND 294 — BUILD WORK, NO WRITES

The freeze stands: you write no money, accounting or load rows. Everything below is
code or measurement.

### A-20 — A-11, BUILD IT. (My ruling, so it stops waiting.)
Your own measurement: the shared backend endpoint is correct (14 sent invoices ties to
raw-table math exactly); the defect is a UI one — an UNFILTERED "Transactions"
mini-table stacked above a FILTERED Invoices table, visibly disagreeing the moment any
filter is applied. **Wire the mini-table to the page's filters.** Do not remove it, the
owner uses it. A number on a page must answer the filter the page is showing.

### A-21 — A-16, THE has-transactions PREDICATE, AS SHARED CODE.
You already specified it: proformas excluded, voided invoices/bills included, voided
expenses/fuel excluded; live 76/1,249 customers and 34/623 vendors have real
transactions; a voided-invoice-only customer COUNTS. Ship it as ONE exported predicate
that both Customers and Vendors call, so the two lists can never disagree. Cursor's
C-19 default filter calls yours — do not let them each write their own.

### A-22 — THE 120 UNRESOLVED ITEM IDS: REPORT, DO NOT RESOLVE.
519/639 resolved, 120 left at $4,901.31. Leave them NAMED. Do not guess a mapping to
close a count — a named unresolved line is honest, a guessed item_id is a lie in the
ledger. Produce the report: line, amount, source document, and what evidence WOULD
resolve it. The owner decides.

### A-23 — THE TEST ROWS: ENUMERATE ONLY.
The "CC-2 live-test check" $25.00 row and the "AUTH-NNN proof line" $1.00 rows are a
standing-law violation and they are still P0 to IDENTIFY — but the delete is frozen.
Enumerate: id, table, amount, created_at, created_by, every JE/posting touched. Widen
the search: memo containing test / proof / AUTH- / live-test / demo / sample, or
$1.00 / $25.00 round proof amounts written by a seat in the last 14 days. Include the
test driver from your own A-12 finding — the only document row in the company belongs
to it. Report the list and the trial-balance impact if they were removed. Write nothing.
Never write a new test row to prove this one.

### A-24 — A-12's LINKAGE DECLARATION.
Zero real USMCA drivers have any document on file. That is a data-population gap, which
is the owner's to fill, not yours to invent. Write the cross-module linkage declaration
the pairing is missing and leave the data alone.

SEQUENCE: A-20 → A-21 → A-23 → A-22 → A-24.

---
## 2026-09-30 — **LEAD RETRACTION: THE MILES WERE ALWAYS IN THE APP**
Read `docs/bus/2026-09-30-LEAD-RETRACTION-THE-MILES-WERE-ALWAYS-IN-THE-APP.md` NOW.

Owner: "This is a different engine than the one from August. You drifted, all that data
is in the app and company and driver settlements. Get them done."

He is right. MEASURED LIVE, USMCA, past 50 days: 148 of 151 loads carry
`miles_practical` WITH a labelled `mileage_source` (History 136 / Routing 11 / Manual 1),
totalling 216,035 mi, against 29,646 gallons across 380 fuel transactions.
**MPG = 7.287, computable today, with no odometer and no Samsara.**

ENGINE A (billed/paid miles, `mdata.loads`) is ALIVE and is what settlements already use —
build against it now. ENGINE B (odometer at geofence crossings) is the VERIFICATION
engine and nothing waits on it. I treated B as a prerequisite for A. It never was.

Love's probe result: 604 Love's geofences, all active; T175 alone has 88 enter/exit
events in 50 days with real store numbers — but the odometer beside every one is NULL
(the blackout). Real driven miles accrue from today forward and will not be invented
backwards.
