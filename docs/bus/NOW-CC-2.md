# CC-2 — ROUND 306 · ENGINE REGISTRY
READ docs/engines/IH35-ENGINE-REGISTRY-2026-10-01.xlsx — sheet 2, your 7 rows, in order.
Each coder builds 100%, no handoff, sequential, additions only after DONE. Fuel first.
1 E-19 fuel import: 52 of 177 live rows have ZERO gallons + one shared import timestamp. Why? Guard it.
2 E-20 Relay ingest: nothing ingested since 09-27; 156/157 rows have no products (gallons).
  OWNER: USMCA fuels on the TRANSPORTATION Relay account; flag ON; RELAY_FUEL_INGEST_CRON_ENABLED=true.
  So the flag is NOT it. Read integration_sync_log for the last Relay ticks; does our request ask for the
  product fields? Prove gallons arrive. Re-import the 52. Relay lag is 12 h min / 5.6 d avg -- not same-day.
3 E-21 fraud detector: run on ingest completion, not every 15 min; never flag on ONE signal
4 E-22 fuel<->GPS match: run on ingest; then the card->unit registry
5 E-26 attribute 46 of 116 findings via driverAtTimeSql; state the 70 as a coverage gap
6 E-27 scorecards on the live fleet (telematics/live-fleet.ts, never a hardcoded count); miles from E-03; visible arithmetic
7 E-28 complaints-against-driver object
RULES sheet 3. Linkage both directions. No GL writes (money pause = creating/moving transactions).
ACK: CC-2 | ACK R306 | E-19 | GO
