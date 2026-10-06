# LANE_CROSS — CC-1 — LST-F416 work-order void reversal memos (2026-10-06)

**Authority:** Lead ROUND 432-CC1 ("YOUR LANE: the general ledger and the posters"). `apps/backend/src/work-orders/**`
is UNASSIGNED in LANES.md.

File outside CC-1's lane:
- `apps/backend/src/work-orders/work-order-financial-settle.service.ts`

**Why:** `verify-no-internal-payload-in-notes` (ROUND 390.3) is red on main. The work-order void's GL reversal memos
moved here from `work-orders.routes.ts` (#25496) still interpolating raw ids (`bill ${bill.id}`, `work order
${workOrderId}`). They now name the bill / expense / work order by their human numbers (display_id / bill_number /
expense_number). The records stay linked structurally on every reversal line. No logic change: same reversals, same
gates. The one added read (the WO display_id) runs only after the linkage / flag / payment gates, once a reversal is
certain.

**CC-2 / CC-3 / Cursor:** nothing to do. This note is the record of the crossing.
