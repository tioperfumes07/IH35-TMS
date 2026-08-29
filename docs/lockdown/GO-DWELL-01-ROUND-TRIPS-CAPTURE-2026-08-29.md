# GO-DWELL-01 — Round Trips calendar + dwell capture (owner 2026-08-29)

Canonical paste: `/Users/jorgemunoz/Downloads/PASTE-TO-CURSOR-DWELL-01.txt`  
Preview canvas: `/Users/jorgemunoz/.cursor/projects/tmp-ih35-main-sb/canvases/round-trips-dwell-timeline.canvas.tsx`

This is a **capture + view** packet. **Do not add utilization tables.** Populate what exists.

Current live Round Trips UI is **pairing cards** (`apps/frontend/src/pages/dispatch/RoundTrips.tsx`) — oversized dashed “Needs return” boxes. D-5 replaces that surface with **kanban-density calendar lanes**.

---

CURSOR — GO-DWELL-01. The owner's KPI/settlement spine is ALREADY BUILT and 100% EMPTY.
This is a data-capture block, not a schema block. Do not design new tables. Populate the ones that exist.

=========================================================================
THE FINDING — verified live this turn, Neon br-fancy-credit-akjnd07a, je_control=2214
=========================================================================
ALREADY EXISTS, ZERO ROWS:
  utilization.driver_period  0 rows -- minutes_driving, minutes_on_duty, minutes_loading,
     minutes_detention, minutes_idle, minutes_rest, minutes_deadhead, minutes_layover,
     minutes_oos, minutes_unaccounted, minutes_total, total_revenue_cents, total_cost_cents,
     cents_per_productive_hr, cents_per_driving_hr, utilization_pct
  utilization.unit_period    0 rows -- minutes_in_use, minutes_idle, minutes_oos,
     minutes_unaccounted, minutes_total, total_revenue_cents, cents_per_productive_hr, utilization_pct
ALREADY EXISTS, EFFECTIVELY EMPTY:
  dispatch.detention_events 1 · detention_requests 1 · detention_evidence 1 · driver_layovers 1
  catalogs.detention_reasons 1 (ONE reason total)
  driver_finance.settlement_lines 6 lines across 17 driver_settlements
ALREADY EXISTS ON mdata.loads: detention_driver_pay_per_hour_cents, late_delivery_est_deduction_cents

*** THE ONE ROOT CAUSE ***
Of 86 USMCA load_stops: actual_arrival_at is set on 3. actual_departure_at is set on 20 AND THOSE
20 ARE FABRICATED — T122 (R) carries the IDENTICAL departure 08/08 15:21 on deliveries in Edison NJ,
Laredo TX AND Baytown TX. T176 carries 08/08 17:42 on both Edison NJ and Houston TX. A truck cannot
leave New Jersey and Texas at the same instant. That is a backfill stamping now().

CHAIN: no real stop arrive/depart -> no dwell/detention minutes -> utilization.* stays 0 rows ->
no utilization_pct, no cents_per_productive_hr -> no detention line on settlements -> NO driver,
dispatcher, truck or team KPI is computable. Everything downstream is dark from one missing write.

=========================================================================
D-1 (P0) — CAPTURE THE SIGNAL. Nothing else works until this does.
=========================================================================
Stop arrive/depart must be WRITTEN, not backfilled, from every source that can know it:
  a. Driver app arrive/depart button (primary, driver-attested)
  b. Samsara/ELD geofence enter/exit on the stop lat/long (already on load_stops: latitude, longitude)
  c. Dispatcher manual entry with actor + reason (fallback, must be visibly marked as manual)
Write to mdata.load_stops.actual_arrival_at / actual_departure_at. Record the SOURCE of each
timestamp (driver_app | eld_geofence | manual) — a KPI built on unattributed times is not auditable.
DO NOT backfill history. Leave the past NULL and let the UI say "not captured."

D-1 GUARD (verify-steps/NNNNN, NEVER ci.yml — RULE 17): fail if any two stops on DIFFERENT loads or
DIFFERENT cities share an identical actual_departure_at to the second. That is the exact signature of
the current bad data and it must never land again. Planted-failure selftest required.
Cursor: claim EVEN number on main FIRST (Rule 37), then author. Do not claim+file same PR.

=========================================================================
D-2 (P0) — THE SEGMENT MODEL. Every minute in exactly one bucket.
=========================================================================
Per load, the truck's clock decomposes with NO unexplained remainder:
  DWELL@pickup    arrive -> depart            -> minutes_loading
  DRIVE           pickup depart -> delivery arrive -> minutes_driving
  DWELL@delivery  arrive -> depart, SPLIT at contract free time:
                    within free hours -> minutes_loading (not billable)
                    PAST free hours   -> minutes_detention (BILLABLE to customer AND
                                          PAYABLE to driver via
                                          mdata.loads.detention_driver_pay_per_hour_cents)
  GAP             delivery depart -> next pickup arrive:
                    moving empty -> minutes_deadhead
                    stationary   -> minutes_idle   <-- PURE COST. No revenue. Truck payment,
                                                       insurance and depreciation keep running.
ACCOUNTING PROPERTY, ENFORCE IT:
  minutes_driving + loading + detention + idle + deadhead + layover + rest + oos + unaccounted
  = minutes_total, EXACTLY.
minutes_unaccounted is the honesty column — it MUST carry the remainder, never be forced to zero and
never be silently absorbed into another bucket. A large unaccounted number is the truth and must show.

CONTRACT FREE TIME must come from the customer record, not a constant. If none is set, the split
cannot be computed -> write minutes_loading only and flag detention as UNKNOWN. Never assume 2h.

=========================================================================
D-3 (P0) — SETTLEMENT INTEGRATION. This is MONEY. CC-1 lane, not yours.
=========================================================================
driver_finance.settlement_lines already has the right shape: line_type, amount, load_id,
source_table, source_reference_id, category, source_type, posting_account_id, driver_visible,
disputed, approval_status. Detention pay becomes a line with FULL PROVENANCE:
  source_table='dispatch.detention_events', source_reference_id=<event id>, load_id=<load>
RULES:
  - Detention pay posts ONLY from a detention_event with evidence. No event, no line. No exceptions.
  - The line is driver_visible and disputable through the existing dispute columns.
  - Customer-side detention billing and driver-side detention pay are SEPARATE amounts. Never assume
    they are equal and never derive one from the other.
  - Reversal symmetry: voiding a detention event MUST reverse its settlement line and its JE, both
    retained, original never mutated.
  - A trial balance before and after a detention post must still balance, and the delta must be fully
    explained by the retained pair.
CANONICAL: write driver_finance.*, NEVER payroll.* or settlement.* (linkage law).

=========================================================================
D-4 (P1) — POPULATE utilization.* AND MAKE IDLE COST VISIBLE
=========================================================================
Nightly job per driver and per unit per period, from D-2 segments. Then:
  cost_of_idle = minutes_idle/60 * fixed_cost_per_truck_hour
Fixed cost per truck-hour must be DERIVED from real posted costs (truck payment, insurance,
depreciation, plates) per unit per period — NOT a hardcoded rate. If those postings do not exist yet,
render the idle HOURS and label the dollar figure "not computable — fixed cost per unit not posted."
NEVER show an invented dollar amount. That is the whole standard.

KPI surfaces, all derived from the same segments so they can never disagree:
  DRIVER      utilization_pct, cents_per_driving_hr, detention hours earned, avg gap after delivery
  TRUCK       utilization_pct, minutes_idle, revenue per in-use hour, longest idle streak
  DISPATCHER  avg gap between delivery and NEXT BOOKED pickup on loads they booked — this is the
              number that measures dispatch, and it is exactly the owner's complaint
  LANE        avg dwell by customer/facility -> which customers cost you detention

=========================================================================
D-5 (P1) — THE ROUND TRIPS VIEW (design published, build to it)
=========================================================================
  - ONE LANE PER TRUCK. Segments on ONE baseline, butted, never stacked or overlapping:
    LOAD | DWELL | GAP | LOAD | ...   (the last pass drew gaps floating over loads — that is the
    bug the owner flagged: T150's "2d 21h" looked like part of the load; it is the wait AFTER it)
  - One load = ONE bar across however many days, clipped at the window edge, never split.
  - Window 7/14/21/30, DEFAULT 14, with prev/Today/next paging. Never auto-stretch the axis.
  - NB/SB/TR DERIVED, never typed: NB starts at home base, SB ends at home base, TR neither end is
    home. Home base = Laredo/McAllen/Nuevo Laredo/Colombia/Pharr/Hidalgo. Show the stored trip_type
    beside the derived one and FLAG disagreement — do not silently overwrite. (Stored trip_type is
    NB on nearly every row today, which is why the current page shows nothing but NB.)
  - Legs over the 7-day NB/SB target get a red outline.
  - Where stop times are missing, render a dashed "no dwell data" marker. NEVER a fabricated bar and
    NEVER a zero-hour gap.
  - Kanban-sized chips: DispatchKanban.tsx:360 card, column min-w-[230px] at 760,
    compact 200 / standard 230 / comfortable 290.
  - All times through America/Chicago, labelled CT. Never literal "CST" (UTC-6, Nov-Mar only).
  - Sort / group by **truck number** and **load number**. Triangulation = multiple LOAD bars on the same unit lane.

=========================================================================
VERIFICATION GATE — paste all of it
=========================================================================
1. D-1 guard selftest: planted duplicate departure across two cities FAILS; clean fixture passes.
2. Live: a driver-app arrive/depart writes real timestamps with source attribution; paste the rows.
3. D-2: for one real load, the six buckets sum EXACTLY to minutes_total; paste the arithmetic.
4. D-2: a load with no customer free-time set reports detention UNKNOWN, not 0.
5. D-3: a detention event produces ONE settlement line with source_table/source_reference_id;
   voiding it reverses line + JE, both retained; trial balance still balances. Paste before/after.
6. D-4: utilization.driver_period and unit_period go from 0 rows to real rows; paste counts and one
   row with minutes_unaccounted shown honestly.
7. D-5: T150 renders LOAD then GAP as separate butted segments; the owner's U-163 example classifies
   NB / TR / SB with no stored trip_type involved.

LANE: D-3 is MONEY -> CC-1. D-1/D-2 capture -> Codex (dispatch). D-4 KPIs -> CC-1 with GUARD.
D-5 view -> CC-3/Codex. Evidence packets to CC-2; only CC-2 writes prod_verified.
Guards via verify-steps only. Never trigger_deploy. FAST-MERGE step 4 same 15 seconds.

Deploy: 5–10 min AND 5–10 PRs. Live SHA last seen ed4e2f2 — T-01–T-04 proofs wait until healthz/shallow is a descendant of those tips. Remaining Render red: local `authUser()` helpers that `return reply` after requireAuth (TS2339 on `.uuid`) — same class as T-01; utilization.routes already returns null.

T-06: Cascade GR-1 seeded (209 names). Cursor does not mass-repair until names are the ratchet; CC-3 continues next GR-1 failingNames slice. T-07: WAVE-2 `complete:true` with no binding — CC-2 stamps only. T-08: CT timezone — CC-3 P2 after stale-guard slice.
