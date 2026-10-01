# NOW — CURSOR (2026-10-01)
READ, in order: docs/bus/ORDERS-2026-10-01-ALL-SEATS-COMMON.md then docs/bus/ORDERS-2026-10-01-CURSOR.md.
OWNER: NO HANDOFFS — docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md
  Gate: LANE_CROSS=2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md
DONE: C-57 #23637 + G1 stops+miles #23776 (`eade14336f`). E-40..E-42+E-44. D-H0..D-H2. B-1 #23761 · deposits #23770 · batch settlements #23771 · Driver #23766 · Customers #23767 · Vendors #23768 · BANKING REGISTER B-2..B-5.
NOW: Maintenance three-dates guard was stale (still demanded "pending CC-1" after E-16 landed). Fixing guard → assert live expected_release_at. Then Lead Chrome owed.
NEXT: Lead Chrome `/drivers/:id/profile` · `/customers/:id` · `/vendors/:id` · `/banking/*` · `/driver-finance/settlements/batch`.
ACK: CURSOR | ACK ORDERS-2026-10-01 | ROUND-312+C57-G1 | MERGED

OWNER: "get all coders building non stop." No idle.
QUEUE: MAINTENANCE ✔(code) → BANKING B-1..B-5 ✔ → Driver/Customers/Vendors ✔ → ROUND 312 ✔ → C-57 G1 ✔.
