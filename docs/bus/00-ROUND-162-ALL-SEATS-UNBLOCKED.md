
================================================================================
ROUND 162 — LEAD UNBLOCKED YOUR BLOCKERS IN PRODUCTION. NOBODY IS IDLE FOR THE NEXT 2 HOURS.
================================================================================
Owner is away ~2 hours and expects continuous work. Nothing waits on him.

## WHAT THE LEAD FIXED LIVE — STOP WORKING AROUND THESE
### 1. THE UNIT CONSTRAINT WAS WRONG. IT IS REPLACED.
`mdata.uq_loads_one_active_unit` blocked a unit from holding ANY second active load — no notion
of time or tour. That is why CC-1 had 11 units blocked. Owner: "if they are different dates it
should not block it... they are NB and SB loads."
DROPPED. Replaced with `mdata.refuse_overlapping_unit_assignment()` +
`trg_refuse_overlapping_unit_assignment` on `mdata.loads` — a unit may hold multiple active loads
as long as their stop windows do NOT OVERLAP (`daterange(start, end, '[)') &&`). Sequential legs
that hand off on the same day are legal. That is the architecture: a tour is NB -> TR -> SB on one
truck, back to back.
**CC-1: your 155.12 FIX 3 blocker is GONE. It is also already DONE — see below.**

### 2. DISPATCHED IS NOW EXACTLY RIGHT. DO NOT RE-DERIVE IT.
```
dispatched 16 · with_unit 16 · with_wo 16 · missing_unit 0 · range 13624..13639
```
Matches the owner's AlwaysTrack screen exactly. The Lead assigned all 16 units and all 16
customer_wo_number values from the AlwaysTrack control table, in two bulk statements.

### 3. THE 7 STALE LOADS ARE OUT OF DISPATCHED.
13609, 13617 -> `invoiced` (both carry sent invoices).
13616, 13618, 13620, 13621, 13622 -> `delivered`.
That released T156, T164, T168, T171, T173, T175, T176 for the current loads.

### 4. 16 PRE-INVOICES (PROFORMA) EXIST, DATED TO DELIVERY.
One per dispatched load, `status='proforma'`, `issue_date = due_date = scheduled delivery date`.
OWNER LAW: the delivery date IS the cash date — "that is the date we will deliver and factor and
expect the cash in our account." No net-30. Faro pays on purchase.
Proforma is excluded from every issued-invoice test, so A/R, revenue and the GL are untouched.
I created 21 first and DELETED the 5 that were not active loads — there are 16, only ever 16.
Total expected cash on the board: **$91,825.00**.

## CC-1 — YOUR BLOCKERS ARE DEAD. NEXT WORK, IN ORDER.
155.12 FIX 3 — DONE by the Lead. Verify, do not redo.
155.20 JOB 3 — you reported blocked on missing delivery timestamps. The 7 stale loads are already
  advanced. What remains is the REAL fix you already root-caused: **USMCA's Samsara feed was off**.
  Turn it on, backfill the stop stamps for the 16 current loads from Samsara position history, and
  prove `actual_arrival_at` lands. That is the permanent fix for staleness and it is not blocked.
155.12 FIX 2(c)/(d) mileage — you say no real source exists. The source is the Samsara position
  history you are about to turn on, plus the rate cons in ~/Downloads. Derive loaded miles from
  actual stop-to-stop positions once the feed is live. Report the number you get per load.
NEW: the 6 loads sharing 13614's copied-stop-data defect — fix them now, you already baselined it.
NEW: the 1 file sharing settlement-creator's tour_id-check gap — fix it now, same reason.

## CC-2 — SETTLEMENTS DONE. PROCEED WITHOUT WAITING.
5817/5818/5819 posted and verified — good work, and the engine fixes (item_id on quantity/rate,
materialization ordering) are real fixes not patches. PRs #22958 #22959 #22963 noted.
Your purge gate is CORRECT and stays. While the fork finishes, do items 3-5 NOW, they need nobody:
  3. Faro control totals — tie 2150 to the advances, report BOTH numbers. 2150 carries fee and
     reserve; it is NOT the $311,587.00 invoice total.
  4. The 258-row void-header backfill — GL is clean (516 postings, zero unreversed). POST NOTHING.
  5. P-0001/P-0002/P-0004 and the rest of the zero-line P-series — you now have fresh context.
     Read the AlwaysTrack export before deciding which side is wrong. Do not zero a header.

## CC-3 — NOTHING BLOCKS YOU. SHIP THE SCREENS.
Order unchanged: Number column dash -> one column per leg -> the four itemization sections as
ParityTables (FUEL FIRST, it needs zero backend) -> print/PDF buttons -> table color tokens ->
resizable columns -> Live location City/ST and kill the duplicate GPS column -> QuickBooks date
filters -> board views.
NEW DATA IS LIVE FOR YOU: settlement lines now carry quantity/rate_cents (CC-2 backfilled), and
all 16 dispatched loads carry unit + W/O. Your Driver Payment quantity/rate columns and the board
unit columns will render real values now.

## CURSOR — THE MATCH ENGINE. 7 PRs. GO.
ROUND 156 master spec. PR 2 (the accept flow) is the missing half — 0 of 911 matched because it
was never built. Then Faro 09-22..09-25, which is the feed that will give 13616/13618/13620/13621/
13622 their real invoices and advances (they are `delivered` with NO INVOICE in our DB but the
owner says they are in the Faro purchase report in ~/Downloads).

## STANDING, ALL SEATS
Bulk only — set-based SQL, one transaction per batch, report rows/second. Never row-by-row.
Fast merge 4-min. Never --no-verify, never API push, never --admin.
NOTHING GETS HALF BUILT — finish, or name the paused ROUND number in your next status line.
NOBODY IDLES FOR THE NEXT 2 HOURS. If you finish your queue, take the next unblocked item from
another seat's list and say which one you took.

