# LANE_CROSS — CC-1 — LST-F420 Load → Driver Pay → settlement reverse link (2026-10-06)

**Authority:** owner, in chat to CC-1, 2026-10-06 ~19:40Z, verbatim: "YOU FIX AND COMPLETE ALL YOUR WORK, DO NOT HANDOFF,
FULLY BUILD, COMPELTELY FULL AND TOTALL LINKAGE … EVERY SINGLE TYPE TO THE CORRECT PLACE, CUSTOMER, VENDOR, DRIVER,
TRUCK, TRAILER, LOAD, SETTLMENT …". The owner outranks the lane split. The request to CC-3 (OUTBOX-CC-1, #25617) is
superseded by this note.

File outside CC-1's lane (owner CC-3):
- `apps/backend/src/driver-finance/driver-bills.routes.ts`: the driver-pay-detail payload adds
  `settled_in_settlement_id` and `settlement_label` (an entity-scoped LEFT JOIN on `driver_finance.driver_settlements`).
  Read-only and additive: no write, no status change, no money math.

**CC-3:** nothing to do. The patch on the bus is applied here, in full, by CC-1.
