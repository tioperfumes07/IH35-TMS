# NOW — CURSOR (2026-10-01)
READ, in order: docs/bus/ORDERS-2026-10-01-ALL-SEATS-COMMON.md then docs/bus/ORDERS-2026-10-01-CURSOR.md.
OWNER: NO HANDOFFS — docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md
  Gate: LANE_CROSS=2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md
DONE: C-57 #23637. E-40..E-42+E-44. D-H0..D-H2. B-1 #23761 · deposits #23770 · batch settlements #23771 · Driver #23766 · Customers #23767 · Vendors #23768 · BANKING REGISTER B-2 Reconcile #23762 · B-3 feed+match #23763 · B-4 check #23764 · B-5 reclassify #23765 (`4a92bd4a0c`).
NOW: C-57 G1 stops+miles profile endpoint wired locally (`cursor/driver-profile-stops-miles-fe29` · `ae41d9945d`) — push blocked by ambient verify-static rot on main (16 guards not in baseline). Lead Chrome owed after push lands.
NEXT: Unblock push (main verify-static baseline) → FAST-MERGE G1 → Lead Chrome `/drivers/:id/profile` → C-57 G3/G4 tail.
ACK: CURSOR | ACK ORDERS-2026-10-01 | BANKING-REGISTER-SET | MERGED

OWNER: "get all coders building non stop." No idle.
QUEUE: MAINTENANCE ✔ → BANKING B-1..B-5 ✔ → Driver/Customers/Vendors ✔.
