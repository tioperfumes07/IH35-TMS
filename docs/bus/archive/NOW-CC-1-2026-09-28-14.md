# AUTH-090 executed — 2/18 driver bills minted real, 16/18 correctly refused+exception-logged — CC-1 — 2026-09-28 09:25Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-13.md`.

DONE LINE (18 loads 13622-13639, USMCA):
mdata.loads = 18 live. mdata.load_stops = 36 live. dispatch.load_charge_lines = 18 live, 1 per
load (re-verified in one bypass-confirmed transaction after a Neon MCP run_sql_transaction
mid-batch read-inconsistency briefly showed 0 — current_user=neondb_owner,
bypass_setting='lucia', whole-table count=284 matches pg_stat_user_tables; the 0 was tooling, not
real, per the same discriminator used earlier this round). dispatch.non_owned_trailers = 4 active
(538306 survivor + 568871 x2 counterparty-scoped + 21868). dispatch.trailer_interchanges = 3.

driver_finance.driver_bills = 2 live (13631 $644.64, 13634 $656.64 — both real, both priced off
the driver's own active rate card and a real miles_shortest sourced from that load's own signed
rate con: 13631=1343.0mi/loads_5656192.pdf, 13634=1368mi/loads_5661902.pdf). AUTH-090.

MILEAGE SOURCING — all 3 owner-ordered sources checked live for the other 16, in order, none
viable, none invented:
1. Samsara trip distance — integrations.samsara_vehicle_positions has ZERO historical rows for
   the Sept 23-28 transit window; only current-moment pings exist today.
2. Rate con "Miles:" field — checked every one of the 18 loads' own dedicated rate-con PDF (14 of
   18 have one at all; 13623/13627 have none, per the 155.2c DONE LINE). Only 13631 and 13634
   state a figure.
3. PC*Miler/Trimble via /api/v1/dispatch/route-mileage — READ, not called: its own code comment
   (loads.routes.ts ~592-604) documents shortest_miles: null EVERY TIME today by permanent design
   (no shortest-BY-DISTANCE OSRM profile provisioned, locked by
   verify-miles-shortest-never-autofilled-from-catalog.mjs). Calling it would be theater.

Per your own instruction ("record the exception and mint the other bills"): ran the real engine
(ensureDriverBillArtifactsForLoad) against all 18, not just the 2. It minted 2 and let the
engine's own pre-existing P1 refusal gate do its job on the other 16 — one real
`driver_finance.driver_bill.refused_no_shortest_miles` audit.audit_events row per load,
live-verified, timestamps 08:57:37Z-09:04:54Z. That audit row IS the exception record. Nothing
new was invented to produce it.

ON THE BROADER ORDER ("close the loads, settlements, all documents/expenses/bills/cash
advances/AR/AP/escrow, instantly, fully complete") — what is and is not done, and why:

BLOCKED, real reason, not a stall:
- CLOSING the loads: closing means marking them delivered — a real-world event, not a status
  flag I can flip from a desk. I have no POD/delivery-confirmation document for any of these 18 in
  Downloads (only rate cons, which are pre-trip). Flipping status without one would be inventing
  a delivery event. If you have PODs for some of these, name them and I'll close those specific
  loads through the real close path (which will also correctly re-check
  assertClosedLoadHasPricedDriverBill).
- DRIVER SETTLEMENTS (driver_finance.settlement_lines/driver_settlements): out of my lane per
  LANES.md — that's CC-3's table. It's also structurally premature: a settlement is built from a
  closed pay-period of driver bills, and 16 of these 18 loads have no bill yet (real gap above)
  and none of the 18 are closed. There is nothing real to settle yet. CC-2 already has an active
  round (155.4, settlement-truth-close-and-FARO) touching this exact surface — I am not
  duplicating or colliding with it.
- TOLLS / EXPENSES / cash advances / AR / AP / escrow tied to these 18 loads specifically: no
  document for any of these 18 loads exists in Downloads beyond the rate cons already used (I
  checked AlwaysTrack/FARO files just now — those are AR/factoring and settlement-parity data for
  ALREADY-SETTLED, OLDER loads, not these 18; feed-input/settlement-truth-from-pdfs.json is
  confirmed the same, structurally out of range). Building these from nothing would be
  invented data, not seeded data.

DONE, real, mine:
- 2 real driver bills minted, priced off real inputs, live.
- 16 real exceptions on record, one per load, engine-native, timestamped, queryable.
- Every mileage source you named, checked and closed out with evidence, not assumption.

If the 16 loads' real shortest-mileage figures exist somewhere I haven't checked (a specific
AlwaysTrack export, a driver-reported odometer log, a dispatch board field), name the file and
I'll re-run the same script — it's idempotent and will only touch what's still missing.
