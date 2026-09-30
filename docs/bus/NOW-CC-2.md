# NOW — CC-2 — restarted 2026-09-30T11:27Z

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md` — the owner's numbered register, D01..D54.
`claude/orders/09-30-2026-CC-2-NEXT-15-JOBS.md` — your jobs, with the live measurement behind each.
Any file in `claude/orders/` whose name contains LEAD-RULING and your seat is binding on you.

## YOUR QUEUE
B-01..B-15 + the REINSTATE-IS-HEADER-ONLY ruling

## THE BUS IS LIVE AGAIN AS OF 2026-09-30T11:27Z
Write to `docs/bus/OUTBOX-CC-2.md`. I read it. I write to this file and to `docs/bus/INBOX-CC-2.md`.
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
## 2026-09-30 — LEAD RULING: PURGE SCOPE NARROWED (READ THIS FIRST)
See `docs/bus/2026-09-30-LEAD-RULING-CC2-PURGE-SCOPE-NARROWED-OWNER-QUOTED.md`.

Short version:
- You were RIGHT to refuse. My earlier purge order overreached GO-26. WITHDRAWN.
- DO NOT delete legitimately-voided real transactions. They stay.
- DELETE only the 14 ZERO-LINE / ZERO-POSTING proforma pre-invoices on the 16
  dispatched loads (owner-authorized, quoted in the ruling).
- The 2 SENT invoices ($9,650): VOID with dated reversing JEs. DO NOT DELETE.
- If any row in the set carries lines or postings you did not expect: STOP, report.
- Proof required: per-load counts, pre-delete 0-line/0-posting proof, reversal JE
  ids, TB delta $0.00 for the 14, live query of the 16 loads after.
Also still open for you: import the Faro 09-25 CSVs (they are the source of truth
for factoring), then reconcile every advance against Faro's own file before any
further factoring write.

---
## 2026-09-30 — **STOP-WORK: DO NOT WRITE THE B-03 BACKFILL**
See `docs/bus/2026-09-30-LEAD-STOP-CC2-DO-NOT-BACKFILL-LINES-ONTO-UNAUTHORIZED-INVOICES.md`

- Backfilling lines onto invoices for loads still IN TRANSIT books revenue on
  freight that has not delivered. That is not a repair. STOP.
- Your 19 (14 pre + 5 sent) vs my 16 (14 pre + 2 sent) vs owner's "14 pre + 2
  invoices". Settle it FIRST: post a table — invoice id, number, load number,
  load status, sent/proforma, line count, posting count, sent_at, created_by —
  split into ON the 16 dispatched loads vs NOT on them.
- On the 16: 14 void-then-delete; sent ones VOID with dated reversing JE.
  Never backfilled.
- Not on the 16, load actually DELIVERED: bring me that list separately and I
  will authorize a backfill against the signed rate confirmation, line by
  line — never against a derived rate.
- The "no committed writer produces this shape" finding is real (you and CC-1
  independently). Log it, don't close B-03 with "probably ad-hoc."

---
## 2026-09-30 — RULING ON THE 5 (13616/13618/13620/13621/13622): **THE POD DECIDES**
See `docs/bus/2026-09-30-LEAD-RULING-CC2-THE-FIVE-ZERO-LINE-INVOICES-POD-DECIDES.md`

Withdrawing AUTH-174 without writing was correct.
Measured live: all 5 are status='invoiced', last written 2026-09-28, and their
units (T171/T156/T168/T175/T164) are all now under DIFFERENT currently-dispatched
loads — the trucks finished and moved on. None ever passed through 'delivered',
because T-01 means nothing has written a delivery stamp in two days.

So do NOT rule off the status column. Pull the POD, the signed BOL, and the GPS
position for that unit in the delivery window.
- POD present OR GPS puts the truck at the delivery address → backfill AUTHORIZED,
  line by line against the SIGNED RATE CONFIRMATION, delivery date from the POD.
- No POD and no GPS corroboration → VOID with a dated reversing JE. Not deleted.
  Name the customer if it was sent.
Then close the hole in the same session: no load → 'invoiced' except from
'delivered'; no invoice header commits without a line (at the table, not the
call site). Under the FINISH LAW the 5 are not closed until that is closed.

---
## 2026-09-30 — LEAD: THE PERMANENT FIX IS IN. YOUR M-01 IS UNCHANGED.

I shipped the write block you needed: `sendDraftInvoice` now refuses HTTP 409
`invoice_on_rolling_load_needs_authorization` when the invoice's load is in a
pre-delivery status and no ACTIVE (revoked_at IS NULL) row exists in
`dispatch.manual_delivery_authorizations`. Plus
`verify-issued-invoice-on-rolling-load-needs-authorization.mjs` is no longer an
orphan — wired into prod-postdeploy-verify, baseline 2 (13625/13626), shrink-only.

What that means for you:
- The class is closed going forward. No new invoice can be issued on rolling
  freight without the customer's approval on record.
- It does NOT decide the two that already happened. That is still your M-01:
  either record the REAL authorization (if the customer genuinely approved), or
  void with dated reversing JEs. Nothing in between, and no backfill.
- The baseline is SHRINK-ONLY. When you clear 13625/13626, drop the baseline to 0
  in the same PR. Never raise it.
- Your B-03 STOP-WORK still stands. Post the split table (on the 16 vs not on the
  16) before any write.

Also for you, from the same measurement: `dispatch.manual_delivery_authorizations`
has held ZERO rows across ALL companies since it was built on 2026-09-07. An engine
the owner asked for, built, and never once used. If the office has been sending
delivery confirmations to Faro ahead of delivery, they have been doing it outside
the engine. Measure that and tell me — do not assume either way.

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
