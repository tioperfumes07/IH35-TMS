# ROUND 253 — CC-3 — NO BYPASS. FIX THE DATA, THEN FEED THE FUEL ENGINE.

## ANTI-DRIFT CONTRACT — READ BEFORE THE FIRST LINE OF CODE
1. You build EVERY item on your list COMPLETELY: schema, migration, backend service, route DEFINED
   and MOUNTED and CONSUMED by a real frontend surface, GL postings, linkage both ways to every hub,
   catalogs, guards, backfill, and print where it applies. **The Check Creator was reported DONE
   while sitting unmounted and dead for weeks. That must never happen again.**
2. NO HANDING OFF. If something blocks you, you MEASURE it, FIX it, and report what you fixed. The
   only thing you escalate is a write the owner has not authorized.
3. NO PATCHING. Root cause only. No report-only guards, no skips, no `--no-verify`, no exception
   lists, no "same pattern as X" without evidence.
4. NO DRIFT. Do not invent tables, concepts or names not in this document. Do not rename anything.
   Do not "improve" the design. If you believe something here is wrong, say so in ONE paragraph with
   the measurement that proves it, then do what this document says.
5. NEVER write test, sample or demo rows into USMCA — including for proof. Two seats broke this and
   are still reconciling it.
6. USMCA ONLY: 5c854333-6ea5-4faa-af31-67cb272fef80. TRANSPORTATION and TRUCKING stay frozen.
   Reads require BOTH lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
7. Blank is blank. Unknown prints `—`. Never 0 for unknown, never a substituted value.
8. Every guard is REQUIRES_LIVE_DB. A guard that cannot connect is a FAIL, never a pass.
9. Save your completion report to the repo at `claude/<date>-<SEAT>-<ROUND>-REPORT.md` so nothing is
   lost. Cite live SQL output for every claim. Never report DONE without pasted proof.
10. You have API keys available in the Desktop files. No seat may claim it lacks a key.

## ITEM 1 — THE GEOCODE BYPASS IS REFUSED
You asked for a one-time authorized bypass of `verify-stops-are-geocoded.mjs` for load 13628
(Secaucus NJ, "1 County Rd"). **NO.** The guard is correct and the gap is real. A bypass here becomes
the precedent that lets the next one through, and that is how the Check Creator sat dead for weeks.
**You have API keys in the Desktop files — no seat may claim it lacks a key.** Geocode the stop and
write the coordinates.

## ITEM 2 — ALL 349 UNGEOCODED STOPS, NOT ONE AT A TIME
382 USMCA load stops exist. **349 have no latitude/longitude. 33 do.** Build the geocode path so it
runs to completion over the whole set and keeps running for new stops — not a manual one-off.
Sanity gate: longitude −125..−66, latitude 24..50 (this covers NJ, RI, PA, CO, TX; an earlier
proposed −118..−80 gate would have rejected 60 valid stops). Any stop failing the gate is FLAGGED,
never written. Source order: the stop's own street address first, then the vendor/customer record.
Never fabricate a coordinate. Record the source and the confidence on every row.

## ITEM 3 — ODOMETER FROM SAMSARA. THIS IS THE ITEM THAT MAKES THE FUEL ENGINE WORK.
The owner is explicit: **the odometer readings exist in Samsara.** The fuel engine is built but INERT
because `telematics.odometer_readings` is empty — 0 rows — so no load has driven miles and no fuel
burn can be computed.
BUILD, COMPLETELY:
- Pull odometer readings from Samsara per unit for the dates of every USMCA load. Write to
  `telematics.odometer_readings` (unit_id, read_at, odometer_miles, source='samsara',
  confidence='measured').
- Where a FUEL-VENDOR GEOFENCE exists, capture date, time and odometer on geofence ENTRY and link the
  reading to the geofence visit. The geofences already exist — use them.
- Backfill historical readings for every load already in the system so past loads get driven miles.
- Expose it so Devin-A's engine can compute burns: per load, odometer at start and odometer at end.
- NEVER write a synthetic odometer. Missing stays missing.
LINKAGE BOTH WAYS: reading ↔ unit ↔ geofence visit ↔ load ↔ fuel transaction ↔ settlement.

## ITEM 4 — THE CASH-FLOW GUARD (authorization stands)
Rewrite `verify-cash-flow-reads-delivery-date.mjs` to the real rule
`due_date = delivery_date + COALESCE(payment_terms_days, 0)`. Cite "ROUND 247 guard-fix
authorization (Claude Lead, 2026-09-29)". Load 13638's 2026-10-28 due date is CORRECT — its customer
has 17 invoices over two months, all Net 30, none ever due on delivery. No data write. No
special-casing 13624-13639. No report-only.

## ITEM 5 — PUSH ROUND 234
Ratchet at **129 unique locations**, counting LOCATIONS not raw occurrences. Report the push SHA.
Devin-B is holding his branch behind you.

## ITEM 6 — ROUND 235 TRUCK LINE
Answer the measured question first: does the Net $X / overlap fix require ANY edit to
`TruckLineBoard.tsx`? Paste the file list. If not, split the commit and ship it.
`verify-truck-line-board.mjs` is NOT demoted to report-only.

## PROOF REQUIRED
13628 geocoded with its coordinates pasted · stop coordinate coverage before and after (349 → ?) ·
`telematics.odometer_readings` row count and a sample per unit · one load showing odometer at start
and end · the rewritten guard passing live · the ROUND 234 push SHA · the truck line file list.
