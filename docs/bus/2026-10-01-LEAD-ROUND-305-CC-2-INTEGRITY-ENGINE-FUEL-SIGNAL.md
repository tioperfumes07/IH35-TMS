# CC-2 — ROUND 305 (money still paused; the integrity engine, with a real second signal)

Relayed verbatim, recorded here as the citable order record (same pattern as prior rounds).
USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80).

B-43 item 1 is merged — good. Tonight's measurement changes the rest.

## B-46 — THE FUEL SIDE OF INTEGRITY HAS NO GALLONS. FIND OUT WHY. (top item)
Measured live 2026-10-01:
  fuel.fuel_transactions, USMCA, live: 177 rows, 125 with real gallons (14,630 gal total),
    52 WITH ZERO OR NULL GALLONS — and those 52 are exactly the recent batch.
  The 10 newest share ONE identical timestamp, 2026-09-24 12:09:39 GMT — an import stamp, not a
    pump time. 43 distinct timestamps across 177 rows.
  integrations.relay_fuel_transactions: 157 rows in 30 days. ALL 157 carry location_latitude and
    location_longitude, merchant_name, station address and a real relay_created_at.
    ONLY 1 OF 157 HAS `products` POPULATED — and products is where gallons live.
So the gallons are NOT being dropped by our promotion step. THEY ARE NOT ARRIVING FROM RELAY.
ANSWER THIS FROM THE API, not from reasoning: does our Relay request even ask for the product /
gallon fields, and does Relay offer a webhook instead of the polling we do? If our own request
omits the field, that is a fix, not a vendor limitation.
ALSO MEASURED: Relay lag pump -> our database is min 12.2 h, average 5.6 DAYS, max 16.8 days, and
nothing has ingested since 2026-09-27. Relay is not a timely source and cannot be the basis of
same-day fuel-theft detection. Say so rather than building on it.
NO MPG WITHOUT GALLONS. The fuel half of the score is unbuildable for 52 of 177 transactions, and
that is the honest status.

## B-47 — A REAL SECOND SIGNAL NOW EXISTS. USE IT.
I merged apps/backend/src/telematics/stop-odometer-capture.service.ts tonight: per truck, every
stop over 3 minutes, the odometer, miles since the previous stop. Proven live — 66 stops in 24 h,
49 with an odometer, 31 with miles. That is MILES independent of our fuel-card arithmetic.
Samsara's own Fuel & Energy report is a THIRD signal; CC-3 holds that item (T-50).
Owner's standard: two independent signals agreeing is a finding, one alone is a suspicion.
Build the fuel component so it REFUSES to flag a driver on a single signal.

## B-48 — B-29 HAS NEVER RUN ON REAL DATA
Your own note: all 15 live work_orders reference 5 units with ZERO vehicle_driver_assignments
coverage, and those 5 are coder test artifacts. The damage scorecard has never touched a real
truck. Re-measure against the live fleet — read it from live-fleet.ts, do not hardcode 14 or 16,
and note that 24 units are REAL TRUCKS GONE DARK, not test data.

## B-49 — ATTRIBUTE THE 46 OF 116, STATE THE 70
safety.integrity_findings: 46 resolve through driverAtTimeSql, 70 are a telemetry coverage gap.
Attribute the 46. State the 70 as a gap. NEVER attribute a finding you cannot place.

## B-50 — EVERY FLAG CARRIES ITS EVIDENCE AND ITS PERIOD
"Might be stealing fuel" must render as the actual fills, gallons, dates, unit and the arithmetic.
A driver's livelihood is downstream of this screen. A score with no visible arithmetic is an
accusation, not a metric.

## B-51 — COMPLAINTS AGAINST A DRIVER (owner asked directly)
Check whether a complaints object exists before building one. If not: driver, source (customer /
dispatcher / broker), category (lateness, refused dispatch, conduct, damage), date, load and unit
where applicable, detail, who recorded it. Linkage both ways. Its own named component in the score.
NOT money.

## B-52 — re-read this file.
LANE: no apps/frontend, no GL corrections, no reconciliation internals, no integrations/samsara/**.
