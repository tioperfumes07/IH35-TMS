# ROUND 255 — CURSOR REPORT — Truck Line board + responsive

**Seat:** Cursor · **Date:** 2026-09-29 · **Branch:** `cursor/r255-truck-line-board-c89b`

## ITEM 1 — Linkage defect (measured live, Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, USMCA)

### Board query (before)

`views.live_loads` + `CURRENT_TRUCK_LINE_LOAD_SQL` (AUTH-061 48h stamp-less hide) + `assigned_unit_id IS NOT NULL` + `UNIT_IN_SERVICE_SQL`.

### Why the board returned **11** instead of **14** dispatched

Live `mdata.loads` status=`dispatched` = **14**. Board CURRENT+in-service = **11**. Named gaps:

| Load | Unit | Why excluded from board |
|------|------|-------------------------|
| **13633** | T152 | `views.live_loads` / money filter: driver bill has `settled_in_settlement_id` (finished-by-money) while status still `dispatched` |
| **13634** | T152 | Same — settled driver bill; not in `live_loads` |
| **13627** | T170 | Passed money filter / in `live_loads`, but **AUTH-061 CURRENT** hid it (delivery appt `2026-09-25`, no stop stamps, >48h) |

`14 − 2 − 1 = 11`. Exact board load list before fix: `13624,13628,13629,13630,13631,13632,13635,13636,13637,13638,13639`.

### Owner's **2 extra** beyond the 14 dispatched (16 InService units running)

16 USMCA InService units. 12 of them carry a dispatched load. 4 have none: **T122, T124, T147, T163**.

Fresh telematics **today** with **zero** dispatched load in the app (the serious finding — truck physically running, not in the board):

- **T124** — last_pos `2026-09-29` live, no dispatched load
- **T163** — last_pos `2026-09-29` live, no dispatched load

(T122 last pos 2026-09-26; T147 last pos 2026-09-09 — not "running today.")

### Fix

`current-truck-line-load.ts` now **aliases** `canonicalActiveLoadWhereClause` (AUTH-061 retired). Truck Line routes read `mdata.loads` with that predicate. Live after fix:

```
board === canonical = 12 loads:
13624,13627,13628,13629,13630,13631,13632,13635,13636,13637,13638,13639
```

(13633/13634 correctly stay out — finished by money with stale status. Separate write-path defect; not mass status UPDATE.)

Guard: `scripts/verify-truck-line-board-shows-canonical-active-set.mjs` — REQUIRES_LIVE_DB — **LIVE PASS**.

## ITEM 2 — Return trip double rows

T176 legs **13638** (PU 09-25 → DEL 09-28) + **13637** (PU 09-28 → DEL 10-01): second PU = first DEL → return trip. Both rows render; second keeps **unit number** + `↳ return trip` (was blank `↳` only — "unit after 176"). `data-return-trip="true"`.

## ITEM 3 — Column order

`UNIT · TOUR / PRE-SETTLEMENT · LOAD · PU DATE · DELIVERY DATE` — transit sub-row begins under LOAD (`paddingLeft: max(12rem, 17vw)`).

## ITEM 4 — Transit line restored

Green cab (`#16A34A`), exhaust/wheel/bob animations retained, line centred (`mx-auto`), truck **draggable** → status via `transitionDispatchLoad`, **CURRENT LOCATION** after the line.

## ITEM 5 — Row height

`min-height: 56px`, row padding `3px` (was 88px / 6px).

## ITEM 6 — Per-load status dropdown

Click status under the load → in-place dropdown (`truck-line-status-dropdown-*`), not a modal.

## ITEM 7 — Universal combo filter

`truck-line-universal-filter` — unit, driver, customer, status, tour, dates.

## ITEM 8 — Responsive width

Dispatch page: `min-w-0 max-w-full overflow-x-hidden`. Board: `overflow-x-auto`. **Outside lane (report only):** Trip Pairing `min-w-[180px]` cards, PlannerCalendar `min-w-full` tables, RoundTrips `min-w-max` kanban columns, Detention/Factoring `max-w-*` wrappers — still risk page-level horizontal scroll when the window is not maximised; route to CC-3/FE as follow-on.

## Guards

| Guard | Result |
|-------|--------|
| `verify-truck-line-board-shows-canonical-active-set.mjs` | LIVE PASS — 12 = 12 |
| `verify-load-boards-agree.mjs` | PASS — canonical=List/Kanban=Load Costs=Truck Line (12) |
| `verify-dispatch-truck-line.mjs --selftest` | PASS 25/25 |
| `verify-truck-line-board.mjs --selftest` | PASS 18/18 |
| `verify-truck-line-units-only.mjs --selftest` | PASS 3/3 |
| `verify-truck-line-unit-top-level-unique.mjs` | OK |

## Files modified

- `apps/backend/src/dispatch/current-truck-line-load.ts`
- `apps/backend/src/dispatch/truck-line/truck-line.routes.ts`
- `apps/frontend/src/pages/dispatch/TruckLineBoard.tsx`
- `apps/frontend/src/pages/Dispatch.tsx`
- `apps/frontend/src/api/truckLine.ts`
- `scripts/verify-truck-line-board-shows-canonical-active-set.mjs` (new)
- `scripts/verify-load-boards-agree.mjs`
- `scripts/verify-dispatch-truck-line.mjs`
- `scripts/verify-truck-line-board.mjs`
- `scripts/verify-truck-line-units-only.mjs`
- `scripts/verify-truck-line-unit-top-level-unique.mjs`
- `scripts/money-pr-local-gate.mjs`
