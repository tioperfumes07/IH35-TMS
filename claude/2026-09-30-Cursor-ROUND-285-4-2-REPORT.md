# 285.4.2 — canonical active-load set across ALL boards (investigation)

**Branch:** `cursor/r285-part-e-c89b` · **Live DB:** USMCA Neon `br-fancy-credit-akjnd07a`, `bypass_rls=lucia` · **Measured:** 2026-09-30

## Verdict

`verify-load-boards-agree.mjs` **PASS** for 4 sources (canonical = List/Kanban = Load Costs = Truck Line = **12**).
**285.4.2 not done** — guard omits Trip Pairing, Round Trips, and status-bypass callers; live counts diverge.

| Board | Fetch path | Live count | Agrees w/ 12? |
|-------|------------|----------:|:-------------:|
| List / Kanban | `Dispatch.tsx:255-261` → `listLoads` `board_scope=live` → `loads.routes.ts:652` `liveLoadsOpenDispatchExistsSql` | 12 | ✓ |
| Truck Line | `TruckLineBoard.tsx:754` → `GET /dispatch/truck-line` → `canonicalActiveLoadWhereClause` + in-service unit | 12 | ✓ |
| Load Costs | `LoadCostsBoardPage.tsx:571` → `load-costs-board.routes.ts:354-371` money CTE | 12 | ✓ |
| Trip Pairing | `TripPairingBoardPage.tsx:294` → `trip-pairing-board.service.ts:169-172` narrower filter | **11** | ✗ (load 13624: no trip_type) |
| Round Trips | `Dispatch.tsx:252` `include_open_tour_legs` → `loads.routes.ts:641-650` | **24** | ✗ (RT-FULL-TOUR widen) |
| Dispatch Load Costs panel | `DispatchLoadCostsPanel.tsx:43-48` `status: IN_MOTION` bypasses board_scope branch | **14** | ✗ (`loads.routes.ts:625-627` else-if) |

## ONE source (recommended)

Runtime: `liveLoadsOpenDispatchExistsSql("l.id")` ≡ `views.live_loads.live_state = 'open_dispatch'`.
TS mirror: `canonical-active-load-set.ts` (proven equal to view today).

## Minimal fix targets

1. `scripts/verify-load-boards-agree.mjs` — add Trip Pairing + Round Trips (+ mdata/loads live) queries; fail on diff.
2. `apps/backend/src/mdata/loads.routes.ts:625-627` — AND status with open_dispatch, not else-if.
3. `apps/backend/src/dispatch/trip-pairing-board.service.ts:169-172` — membership = open_dispatch only; fix 13624 trip_type at booking.
4. `apps/backend/src/accounting/load-costs-board.routes.ts:370-371` — use `liveLoadsOpenDispatchExistsSql`.
5. Owner ruling: Round Trips `include_open_tour_legs` — retire for 285.4.2 equality or document guarded superset.

## Guards

- `verify-load-boards-agree.mjs` — extend (verify-step 11671)
- `verify-list-loads-requires-board-scope.mjs` — already PASS (285.4.1)
