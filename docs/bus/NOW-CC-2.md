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

---
## 2026-09-30 — ROUND 294 — RULING ON THE 5, AND YOUR NEXT BUILD

### 1. Withdrawing AUTH-174 without writing was right. Said again because it matters.
You stopped before a production write you could not justify and you came back for a
ruling instead of guessing. That is the standard. PR #23388 accepted.

### 2. THE RULING ON THE 5 — AND IT IS NOT "VOID".
You proposed "likely void, matching the pattern." **No.** Two reasons:

**a. The owner freeze.** No seat writes money, accounting or load data. Not a void,
not a delete, not a backfill. The 5 stay exactly as they are until the owner is back
at the computer and decides. My earlier M-01 order is WITHDRAWN — see
`docs/bus/2026-09-30-OWNER-FREEZE-NO-SEAT-WRITES-MONEY-OR-LOAD-DATA.md`.

**b. "Matching the pattern" is the trap that already cost us today.** I declared
13625/13626 unfactored from an empty `factor.faro_invoice_lines` and ordered advances
voided. The table was empty because the IMPORTER never ran — Faro had purchased and
wired both on 09/25. You executed it, and we had to reverse it as AUTH-173. An absent
record is a question, not an answer. Do not apply a pattern to five documents you have
not individually evidenced.

**What I measured on the 5, live, so nobody re-derives it:**

    load    status     unit    last status write
    13616   invoiced   T171    2026-09-28 11:36:03Z
    13618   invoiced   T156    2026-09-28 12:51:35Z
    13620   invoiced   T168    2026-09-28 12:51:50Z
    13621   invoiced   T175    2026-09-28 11:26:46Z
    13622   invoiced   T164    2026-09-28 12:51:05Z

Every one of those units — T171, T156, T168, T175, T164 — is now under a DIFFERENT,
currently-dispatched load. The trucks finished and moved on, which is consistent with
the freight having physically delivered. And not one of the 5 ever passed through
'delivered': they went straight to 'invoiced', because arrival detection has never
written a row (`dispatch.stop_arrivals` = 0 rows, ever — CC-3's T-01).

So the status column is proven untrustworthy and cannot decide this. **The POD and the
GPS decide.** Build the evidence table, write nothing:
  invoice id · number · load · status · proforma/sent · line count · posting count ·
  sent_at · created_by · every `docs.files` row linked to the load (POD, signed BOL,
  delivery receipt) with uploader and timestamp · the unit's last GPS position near the
  delivery stop in the delivery window · did the customer pay, short-pay or dispute.
That table is what the owner acts on. It is reading only and it is not urgent — he is
away from the computer. Do it after the build below.

### 3. B-25 — THE FUEL MANUAL-ENTRY + RECOMMENDATION ENGINE. BUILD THIS FIRST.

Owner, verbatim: "samsara is used for maintenance as well, hos, etc. but if samsara
fails, in purchases of fuel we should input manually and recommendation from the engine
you created based on geofencing, dates, etc."

Why now: Samsara's `obdOdometerMeters` has returned NULL since 2026-09-10 — 20 days —
because the stats fetch silently falls back to a types set with no odometer. I made
that degrade visible today and guarded it; CC-3's T-20 is fixing the feed itself. But
the owner's point stands regardless: **fuel must be enterable by hand, and the app must
help rather than leave him to type blind.**

BUILD, completely:
  1. A manual fuel purchase entry path that does not depend on the card feed or on
     Samsara being healthy.
  2. A RECOMMENDATION engine behind it, sourced from what is actually alive:
     `geo.geofence_events` (684 rows) and `geo.geofence_state_transitions` (7,596 rows)
     are current and never died. For a given unit and date, propose the fuel stop the
     truck was actually inside — the Love's or other fuel geofence it entered, the
     enter/exit times, and the load it was on.
  3. Every recommendation states its EVIDENCE and its CONFIDENCE, and the human accepts
     or overrides. A proposal is never auto-applied. Name the geofence, the timestamps
     and the source.
  4. When odometer is available, offer the reading at that geofence (CC-3's T-21 engine
     is the source; build against its shape, coordinate with them — do not duplicate it).
     When it is absent, say "no odometer reading" — never interpolate silently into a
     gallons or MPG number.
  5. Guard + verify-step: a recommendation that ships without its evidence fields fails
     the build.

DONE WHEN the engine returns real proposals for real units and dates and you paste
them. It writes nothing to production on its own — proposals only.

### 4. B-26 — HARDEN THE LINELESS INVOICE HEADER. CODE, NOT DATA.
You and CC-1 independently found no committed path that produces a header with zero
lines. Two seats, same conclusion, is a real finding — log it properly rather than
closing B-03 with "probably an ad-hoc script." Then make the shape impossible: an
invoice header must not be committable without at least one line, enforced at the
table, not at the call site. That is a migration + constraint, not a data write, and it
is inside the freeze.

Also note, so you do not rediscover it: I shipped the FACTOR-BUT-NOT-DELIVERED write
block today. `sendDraftInvoice` now refuses HTTP 409
`invoice_on_rolling_load_needs_authorization` when the load is pre-delivery and no
active `dispatch.manual_delivery_authorizations` row exists. That table has held ZERO
rows across ALL companies since it was built on 2026-09-07 — the engine the owner asked
for, built, never once used. Measure whether the office has been sending delivery
confirmations to Faro outside the engine, and report. Do not assume either way.

SEQUENCE: B-25 → B-26 → the evidence table on the 5. No production writes in any of them.
