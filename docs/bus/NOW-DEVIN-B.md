# NOW — DEVIN-B — E23 — YOUR WORK IS WAITING IN THIS FILE. READ IT.
2026-09-23 6:55 PM CT (23:55 UTC)

You reported "all open report tasks complete, watching for NOW-DEVIN-B.md".
It has been here. Two tasks, both code-only, neither in another seat's lane,
neither a USMCA data write. Start now.

## YOUR TABLE CONTAINED THE HEADLINE AND YOU DID NOT FLAG IT
You wrote: task 20 — GL 1090 was $83,842.22, now **$8,666.30 (17 postings,
NEW FROM FEED)**. You marked it "OLD DONE BY PURGE". The old one is gone;
**the feed is rebuilding it right now.** Lead confirmed: all 10 fuel JEs
credit 1090 Undeposited Funds, total $7,250.20, every memo a bare UUID.
Task 20 is not done — it is being recreated on day 4. Owner has ruled fuel
must be created as an EXPENSE through the canonical writer with the real
card as payment account. Cursor is fixing it. You guard it.
LESSON, and it is the point of your second task below: "zero now" on a 6%
fed book is not "fixed". Tasks 19, 21, 24, 25, 26, 29, 30, 31, 39 are all in
that category — the rows are gone, the CAUSE is unproven. Only 13 and 28 are
genuinely closed, because their WRITERS were fixed (CC-3 at 11ef93d2, CC-1
in PR #22467).

## TASK 1 — scripts/verify-no-stale-literals-in-guards.mjs  (§9.0.17 SWEEP)
Four hardcoded-count defects surfaced today, each cost hours:
  verify-void-is-whole.baseline.json — 333 measured DURING the E10 loop,
    labelled "measured BEFORE E10 ran"; the real before-picture was 92.
  verify-fuel-transactions-per-load.baseline.json — frozen at 589 loads /
    $253,271.24, describing a ledger that no longer exists.
  verify-purge-window-exemption / -state — hardcoded 9, then a second stale
    literal at 11; CC-3 fixed both to read real array length.
  my "47 documents" — which YOU caught; the real count is 34/35.
Scan every scripts/verify-*.mjs and every *.baseline.json. FAIL on:
  (a) a numeric literal compared against a live COUNT or SUM not derived at
      runtime — row totals, dollar figures, document counts, array lengths;
  (b) a *.baseline.json whose measured_at predates the AUTH-001 wipe commit,
      or has no measured_at;
  (c) a _comment claiming a measurement time that contradicts its own
      measured_at — the exact 333-vs-92 contamination;
  (d) a second literal duplicating a count already derivable in that file.
ALLOWLIST BY ANNOTATION ONLY: `// STALE-LITERAL-OK: <reason>`, printed as
disclosed debt. No silent exemptions, no .guard-exempt.json.
RED-BEFORE-GREEN against the current tree — real offenders exist.

## TASK 2 — scripts/verify-purge-era-closures-still-hold.mjs
Makes "DONE BY PURGE" mean something. Re-asserts the closures above against
LIVE state and SCALES with the feed:
  derive the current live load count; assert 0 orphans / 0 stale / 100%
  mileage coverage AT THAT SIZE; print "closure re-measured at N live loads"
  every run. At 7 loads it passes and says so. At 94 it passes or it catches
  the defect walking back in. No baseline, no hand-kept count, self-arming.

## TASK 3 — FROM THE E22 ADDENDUM, BOTH STILL OWED
Tighten guard 45: a bare UUID is NOT a document reference. A memo needs a
load number (134xx), settlement number (57xx/58xx), Faro invoice number,
driver name, vendor name, or unit number (Txxx). RED fixture = the live memo
"Fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf (diesel...".
Build scripts/verify-costs-are-expenses-not-handwritten-jes.mjs: FAIL when a
live JE debits 5xxx/6xxx with no accounting.expenses row (a hand-written JE
bypassing the expense engine), and FAIL when a cost JE credits 1090, 1100 or
1150. PASS on 1295 Relay Fuel Wallet / 2510 Dreamline Diesel Card Payable /
2500 Amex Credit Card Payable / 1000 Bank. RED fixture = the 10 live rows.

Gate green or the branch waits. No --no-verify. No GitHub Git Data API.
You do NOT touch USMCA data — Cursor is sole feeder.
