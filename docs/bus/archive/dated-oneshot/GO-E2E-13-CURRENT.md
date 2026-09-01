# GO-E2E-13 CURRENT · 2026-08-31 10:55 CT · SEE ALSO `docs/bus/GO-E2E-LEDGER-REGISTER-2026-08-31.md`

**JE:** USMCA Aug real=**236** held (Cursor Neon). Ignore unscoped 251.
**Registered:** Devin L1 UI + L2 API artifacts (stops/invoice/bill). Charge lines → CC-2.
**Blocked:** Cascade LOAD-4; LOAD-2 flat UI #18783; tip deploy for #18782; SETL-45 settle.
**Law:** Live Chrome walking only — no pictures; API book ≠ DONE.

PASTE TO CURSOR — CURRENT STATE GO — 2026-08-31 ~15:20 UTC
SUPERSEDES the P-0 and gating sections of 11-MASTER. Everything else in the pack
(00,01-07,08,09,10,12) still stands as written.

################ 1. WHAT IS ALREADY DONE — STOP RE-TICKETING IT ################

P-0 IS CLEARED. Both broker emails are status='cancelled' — verified in Neon:
  2256a643-... -> R2XPAPERWORK@R2XLLC.COM      cancelled
  84c98ff8-... -> invoices@pfllogistic.com     cancelled
Nothing was deleted. Good execution. Do not re-open this.

MONTH-END HOLDING. Unflagged August JE count = 236, unchanged, through actual
load creation. The guard is working.

DEVIN-A HAS DONE THE ONLY REAL CHAIN WORK TODAY. Credit it explicitly:
  - TEST LOAD #1 BOOKED + DISPATCHED: L-20260831-0004, with a proforma invoice
    AND a driver bill. Loads 67 -> 70. Newest 15:15.
  - DELIBERATELY BAD LOAD (shape #6) PASSED: the system REFUSED a $0 rate and
    refused a load with no driver pay rate — Book/dispatch button DISABLED.
    No rate invented. No voids. That is a genuine negative-test PASS and it is
    exactly what shape #6 was for.
  - TOP-20 FINDING RE-VERIFY: 3 WITHDRAWN, 12 CONFIRMED, 5 N/A.
    Withdrew: "expenses all null" (227 expenses, 0 null amounts/dates — real
    columns are total_amount_cents/transaction_date/vendor_uuid), "journal
    entries 0" (548), "drivers 0" (175).
    Confirmed: settlement gap 44/54 loads with zero lines; factoring rate
    hardcode. That is a seat correcting its own record. It is worth more than
    thirty new findings.

################ 2. DROP THE CC-1 GATE. IT IS NOW A LIABILITY. ################

I wrote "CC-1 gates everyone." That was right when I expected a chain to start in
minutes. It has become a single point of failure: CC-1 never booked a load, and
five seats sat waiting on it for three hours.

DEVIN-A PROVED THE GATE UNNECESSARY BY WALKING IT ALONE.

NEW RULE, EFFECTIVE NOW:
  Any seat with live-Chrome tooling books its assigned load shape NOW.
  Nobody waits on CC-1. Nobody waits on anybody.
  CC-2 still verifies and still creates nothing.
  Shapes (from the six-shape split, unchanged):
    1 BASELINE per-mile single-stop      CC-1
    2 OWNER-OPERATOR flat $300/load      Cascade
    3 MULTI-STOP + EXPENSES              CC-3
    4 TEAM SPLIT two drivers one load    Cascade
    5 SHORT-PAY (customer pays less)     Codex
    6 DELIBERATELY BAD                   Devin-A  <-- ALREADY PASSED

################ 3. THE REAL BLOCKER — AND THE DATA THAT CLEARS IT ################

driver_finance.driver_pay_rates rows created today = 0. Newest is still 08-07.
That is WHY Devin-A's bad-load test refused. The refusal was correct. But NO SEAT
CAN COMPLETE A SUCCESSFUL CHAIN until a real rate card exists.

THE RATES ARE NOT UNKNOWN AND MUST NOT BE INVENTED. They are in the owner's own
August files (docs/lockdown/Coders-Faro/CC-1/CC-1-DRIVER-SETTLEMENTS.csv), and
they are derived and verified — see pack file 12 for full provenance:

  BASE, per mile, on ALL MILES (loaded + empty):
      $0.45/mi   17 settlements   <-- the standard rate, USE THIS
      $0.50/mi    6 settlements
      $0.43/mi    3 settlements
  BASE, flat per load:  $300.00   (2 settlements)
  EXTRAS: LAYOVER $25/NIGHT · ENLONADA $25 · DESENLONADA $25 ·
          EXTRA_DELIVERY_DROP $25 · HIRING_BONUS $50 per 1/4 tranche

  MILES BASIS IS ALL MILES. NOT loaded-only. The rates only resolve against
  loaded+empty; loaded-only scatters $0.41-$0.85 and nothing reconciles.
  PROOF: sett 5783 = 3,812.5 mi x $0.50 = $1,906.25 exact (also 5771, 5777).
  INDEPENDENT PROOF OF $0.45: an existing August row reads
    "Bonus 60 MILLAS EXTRA X.45 CENTAVOS $27.00" -> 60 x 0.45 = 27.00 exact.

FIRST ACTION FOR THE FIRST AVAILABLE SEAT WITH CHROME:
  Create ONE real driver pay rate through the UI: $0.45/mi, basis = ALL MILES,
  is_test_data=true, on the driver the next TEST load will use.
  This also proves Cursor's #18666 RLS-GUC fix, which has never been verified
  live — zero rates have been created since 08-07.
  Then the chain can actually complete instead of correctly refusing.

################ 4. CURSOR — STOP WRITING WAKE TICKETS ################

31 merges in the last 60 minutes. LEAD-TICK-0250, 0251 (FOUR-DEAD), 0252,
0253 (THREE-DEAD). Ten-plus wake tickets across the shift.

An eleventh ticket will not produce a twelfth result. Writing a commit that says
the seats are dead is not the same as finding out why. Before any further
LEAD-TICK, answer these three about EACH silent seat, in one line each:
  a) does it have live-Chrome tooling LOADED this session? (yes/no)
  b) is it waiting on an authorization no human has given it? (yes/no)
  c) is it blocked on the missing pay rate? (yes/no)
All three are answerable in one round of questions. None are solved by a ticket.

ALSO OPEN, from this hour:
  #18768 OUTBOX-DEVIN-A-UNRESOLVED-GIT-CONFLICT-MARKERS — a bus file has raw
  conflict markers committed to main. Fix it; it will corrupt the next seat that
  reads that OUTBOX.

################ 5. THE BUILD LANE — DOES NOT TOUCH THE CHAINS ################

Pack file 12 (DRIVER-PAY-CODES-AND-LAYOVER-SPEC) goes to a seat NOT walking a
chain. Owner requirement: layover becomes ONE LINE PER NIGHT with a date picker,
not one lump row with dates typed into a description. Reason codes replace free
text across all extras and deductions.

Build order is additive-first so it cannot break a chain in flight:
  1 catalogs.driver_pay_codes + Lists CRUD + seed  (nothing reads it yet)
  2 settlement_lines gains pay_code/service_date/quantity/unit_amount_cents, all
    NULLABLE
  3 the UI writer (date picker, one line per night, code-driven amount)
  4 UNIQUE (settlement_id, pay_code, service_date, driver) + guard + selftest
  5 map the 32 add-pay / 74 deduction rows; keep originals in legacy_description
  6 only then pay_code NOT NULL, retire free text
NO refactor of settlement_lines while a chain is mid-walk. One PR per step,
4-minute merge, one deploy per 5-10 PRs, CC never trigger_deploy (Rule 42).

################ 6. UNCHANGED LAW ################
NO VOIDS on INV-2026-00049..00081 — real transactions, reconciled tomorrow.
NOBODY closes the August period. Owner only.
Unflagged August JE count must stay 236. CC-2 watches every 20 min.
is_sample_data=true ON THE LOAD at book time — every downstream read is `?? false`
  so a missed hop silently posts REAL money. Any hop that posts unflagged: STOP.
USMCA only. Live Chrome, real UI. No SQL seeding. live_load_number never NULL.
Reload + Neon is proof. A toast is not. A screenshot is not.
First break: STOP, file exact error + URL, no workarounds.

################ 7. HOURLY OWNER REPORT — 5 LINES, NOTHING ELSE ################
  1 chains complete (n of 6) and which shapes
  2 chains broken and at which phase/step of the 47-check list
  3 unflagged August JE count vs 236
  4 driver pay rates created today (currently 0 — this is the blocker)
  5 what is blocked on the owner
No merge counts. No bus volume. No census.
