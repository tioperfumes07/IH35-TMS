# ROUND 254 — DEVIN-A — STOP INVENTING. COMPUTE THE BURNS AND FINISH THE TEMPLATES.

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

## OWNER CORRECTION — READ THIS TWICE
Owner: *"those tank events are documents... or transactions created by the app for fuel expenses
stemming from each company and driver settlement for each load. Those purchases are assigned to
those trucks and loads."*
He is right and this closes a drift. A "tank event purchase" is NOT a new concept — it IS the fuel
expense the app already creates from each settlement, already assigned to a truck and a load. Do not
invent a parallel world. The purchase side is the existing fuel transaction, full stop.
**The only genuinely new thing is the BURN side**, and it needs odometer miles.
Do not create any further new tables, names or concepts beyond what is already built.

## ITEM 1 — COMPUTE THE BURNS. THE ENGINE IS INERT WITHOUT THEM.
Measured live: `fuel.tank_events` 114 purchases, **0 burns**. `fuel.load_fuel_cost` 149 rows, ALL
`confidence='unavailable'`. `telematics.odometer_readings` **0 rows**.
CC-3 ROUND 253 Item 3 is pulling odometer readings from Samsara per unit per load date, plus geofence
entry captures. **The moment those rows exist, compute the burns.** Coordinate directly with CC-3 —
that is not a handoff, it is your dependency, and you own making it land.
BURN RULE, unchanged: `gallons = driven_miles / mpg`; `cost = gallons × the weighted average in force
at that moment`; the average does not change on a burn; gallons at 3 decimals, money in whole cents,
final cent to the largest component. Negative tank = FLAG and continue, never clamp.
MPG precedence with the method recorded: tank_to_tank (both fills fill-to-full with odometers, reject
samples outside 3.0–12.0) → unit rolling 90d → fleet_class_default.
Where odometer still does not exist: `driven_miles` NULL, `confidence='unavailable'`. Never substitute
short miles or practical miles. PRACTICAL is billed, SHORT is paid, DRIVEN burns the diesel.

## ITEM 2 — THE REAL DOWNTIME EVENTS, FROM REAL DATA
One real event exists (T168, 2026-09-26, COMSTOCK PARK MI). Build the rest from live data, never by
hand: every gap between a delivery and the next pickup for a unit is a candidate downtime event.
Populate `downtime.event_costs` and `downtime.lost_opportunity` — both are currently **0 rows**, so
the second engine is also inert. Idle hours from Samsara engine-on idle, never elapsed clock. Idle
rate default 0.800 gal/h stored in catalogs, not in code, and only as a fallback behind the unit's
own measured rate.

## ITEM 3 — FINAL TEMPLATES, IDENTICAL TO THE LOCKED DESIGN
Driver: Leg · PU date · Pickup location (warehouse name + address) · Del date · Delivery location ·
Qty · Rate · Amount. No Description column. Deadhead reads LAST DELIVERY → NEXT PICKUP.
Company: PU date · Customer · Pickup location · Del date · Delivery location · Qty · Rate · Amount,
then the cost ledger with Odometer and Miles-since-fill, each section closed by its own total
(Total revenue · Total driver payment · Total fuel purchased · Total fuel consumed · Total expenses
and tolls · Total repairs and breakdowns), then the highlighted margin rows.
Extra pay is ONE ROW PER DATE. Empty miles split BY SEGMENT.
The company settlement PDF is ALWAYS three documents in one file — page 1 settlement, page 2 downtime
and idle ledger, page 3 real fuel cost per load. No flag, no toggle, no export path emits page 1
alone.
Invoice: masthead with invoice no / date / terms / due date, NO balance box at the top, bill-to, load
and references, stops with appointment and IN/OUT, line items, then the totals stack at the BOTTOM
RIGHT ending in Balance Due. Every accessorial names its approver and channel.
THEN REGENERATE all settlement and invoice PDFs from the FINAL templates.

## ITEM 4 — INVOICE GENERATION AND FACTORING SUBMISSION
The load closing mints the invoice from the rate confirmation. The driver's photo upload IS the BOL.
When rate confirmation + BOL + POD are all present in `docs.files` and linked to the load, the
package submits to Faro automatically with the batch id written back. Missing a document = invoice
created but held NOT SUBMITTABLE, and the board says which document is missing.

## ITEM 5 — DRAFT EXPENSES ON SETTLEMENTS
A draft expense APPEARS on the settlement and IS in the margin, FLAGGED unposted. It does NOT appear
in anything tying to the GL. Never silently include or silently exclude.

## ITEM 6 — HOLD THE GUARD AT 973.53
Do not relax it. It fails for the right reason until CC-1 reinstates the AUTH-089 charge.

## PROOF REQUIRED
`fuel.tank_events` burn count > 0 with a sample row · `fuel.load_fuel_cost` for 13549 and 13555
showing driven miles, gallons consumed, mpg and method · `downtime.event_costs` and
`lost_opportunity` row counts > 0 · the three-page company settlement PDF plus a black-and-white
print · an invoice PDF from the final template · `docs.files` ids and live Chrome URLs for all of it.
