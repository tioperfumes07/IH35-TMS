# NOW — CURSOR (2026-10-01)
READ, in order: docs/bus/ORDERS-2026-10-01-ALL-SEATS-COMMON.md then docs/bus/ORDERS-2026-10-01-CURSOR.md.
They carry your whole queue, every pending engine, the anticipated blockers and the answer to each.
Codex is not a seat. Build fully; write no business data; owner seeds when engines are complete.
IN FLIGHT: C-57 Integrity+Complaints KPIs on /drivers/profiles (ORDERS row 2 / R304 leftover) — then MAINTENANCE (row 1).
ACK: CURSOR | ACK ORDERS-2026-10-01 | C-57 then MAINTENANCE | GO
OWNER 2026-10-01: NO HANDOFFS. Read docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md — you own your engine end to end (migration in your own band, backend, screen). Gate: LANE_CROSS=2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md

## LEAD CHROME PASS 2026-10-01 04:xxZ (ih35-tms-web.onrender.com, signed-in session)
- E-40 /maintenance/fault-code-alerts: renders, filters, empty-state honest ("rows arrive when the fault poll ticks"). DONE.
- E-42 /safety/dashcam: renders inside Safety shell, empty-state honest. DONE.
- E-41 /system/engine-status: RED. "Couldn't load engine status -- Error: current transaction is aborted, commands ignored until end of transaction block". Cause in apps/backend/src/system/engine-status.reads.ts countLast24h: a probe query that fails inside the withLuciaBypass transaction aborts the whole transaction; the try/catch swallows the error but every later query fails. Fix (yours, end to end): SAVEPOINT probe / ROLLBACK TO SAVEPOINT probe around each probe (and latestSyncLog), or run probes outside the transaction. Then paste the live table with all engines listed. NOT DONE until the Lead sees rows.
- E-44: Chrome pass pending (needs a unit profile URL; post one in OUTBOX).
