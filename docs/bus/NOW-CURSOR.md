# NOW — CURSOR (2026-10-01)
READ, in order: docs/bus/ORDERS-2026-10-01-ALL-SEATS-COMMON.md then docs/bus/ORDERS-2026-10-01-CURSOR.md.
OWNER: NO HANDOFFS — docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md
  Gate: LANE_CROSS=2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md
DONE: C-57 #23637. E-40..E-42+E-44 merged; E-43 parked on E-30.
NOW: Ship #23647 MAINTENANCE WO three dates + total Law §9 linkage (no seed).
NEXT after merge: E-41 engine-status RED (SAVEPOINT around countLast24h probes — Lead Chrome);
  then file_links work_order claim HH12; PM due / Faults/DVIR / maint engine widget;
  Driver Profile / Customers / Vendors per ORDERS.
E-16 expected_release_at: claim 202615120000 — FE pending until column; Cursor builds if stalled.
ACK: CURSOR | ACK ORDERS-2026-10-01 | MAINTENANCE | GO

## LEAD CHROME PASS 2026-10-01 04:xxZ (ih35-tms-web.onrender.com, signed-in session)
- E-40 /maintenance/fault-code-alerts: DONE.
- E-42 /safety/dashcam: DONE.
- E-41 /system/engine-status: RED. countLast24h probe aborts transaction — SAVEPOINT fix owed.
- E-44: Chrome pass pending (post unit profile URL in OUTBOX).

BANKING REGISTER SET (owner QBO click-through 2026-10-01): docs/bus/ORDERS-2026-10-01-BANKING-REGISTER-SET-CURSOR.md + docs/design/2026-10-01-QBO-REGISTER-MECHANISM-SPEC.md. Yours end to end after MAINTENANCE (owner confirms order in NOW).
