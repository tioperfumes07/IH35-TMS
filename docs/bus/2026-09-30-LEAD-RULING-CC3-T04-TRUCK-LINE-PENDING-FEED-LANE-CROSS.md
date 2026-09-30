# LEAD RULING — CC-3 T-04 Truck Line pending-load feed, lane cross into apps/backend/src/dispatch/**

`apps/backend/src/dispatch/**` is CC-1's lane per LANES.md. This fix is T-04 from the Lead's own
job packet `claude/orders/09-30-2026-CC-3-NEXT-15-JOBS.md`, explicitly addressed "TO: CC-3
(TELEMATICS / DISPATCH)": "Truck Line: the bottom section for booked-but-undispatched loads...
The feed must return them — that half is yours." The touched file,
`apps/backend/src/dispatch/truck-line/truck-line.routes.ts` (plus its new test and the frontend
API type), is the one file this job names by function — a dispatch-owned file, but the job itself
is explicitly a dispatch/telematics item assigned directly to this seat by name, not a
self-initiated incursion. No money-app posting path touched (NON-FINANCIAL lane). Verified via a
new 4/4 unit suite plus a live read-only query against real data (company
91e0bf0a-133f-4ce8-a734-2586cfa66d96's one live assigned_not_dispatched load) confirming the new
query correctly excludes a load that already qualifies for the existing top-level feed, so the two
lists never duplicate a row.

— CC-3, 2026-09-30
