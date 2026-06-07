═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-55 — CAP-1 Real-Time GPS on Every Active Load
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-C  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP-51 ships (depends on DS-3/DS-4 Samsara import)
PAIRED WITH: GAP-56 (Lane B) — same wave P2-C

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-56 owned):
  apps/backend/src/integrations/samsara/auto-status-switch/**
  apps/backend/src/jobs/auto-status-switch-worker.ts

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/integrations/samsara/positions/live-position.service.ts  (NEW)
  apps/backend/src/integrations/samsara/positions/live-position.routes.ts   (NEW)
  apps/backend/src/integrations/samsara/positions/__tests__/positions.test.ts (NEW)
  apps/backend/src/jobs/samsara-position-poll-worker.ts                     (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                        (EDIT — add GPS column)
  apps/frontend/src/components/dispatch/LoadLivePositionCell.tsx            (NEW)
  apps/frontend/src/pages/dispatch/MapView.tsx                              (NEW)
  apps/driver-pwa/src/screens/MyPosition.tsx                                (NEW)
  scripts/verify-cap-1-live-gps.mjs                                         (NEW CI guard)
  docs/specs/gap-55-cap-1-live-gps.md                                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-1 from Samsara Capabilities sheet · "Foundation — must be in 
        place before anything else operates" · NOT BUILT · UNBLOCKS 
        CAP-2/3/4/5/13 visibility features

PROBLEM: Dispatch board has NO real-time GPS visualization per active load. 
Operators must alt-tab to Samsara dashboard to see truck position. Driver 
PWA has no "own position" indicator.

SCOPE — ADDITIVE ONLY:

PIECE A — Live position service
  live-position.service.ts:
    getLivePositionsForActiveLoads() →
      JOIN dispatch.loads (status='in_transit') ⨝ 
      integrations.samsara_vehicle_positions (latest row per vehicle).
      Returns [{load_uuid, unit_uuid, lat, lng, speed_mph, recorded_at, 
                stale}] (stale = recorded_at > 5 min ago).

PIECE B — Routes
  GET /api/integrations/samsara/positions/active-loads
  GET /api/integrations/samsara/positions/unit/:unit_uuid
  GET /api/integrations/samsara/positions/driver/self (PWA endpoint)
  All cached 30s per CAP-1 freshness budget (informs future GAP-23/24).

PIECE C — Background poller
  samsara-position-poll-worker.ts:
    Every 30s: poll Samsara /fleet/vehicles/locations for active fleet.
    UPSERT into integrations.samsara_vehicle_positions.
    Cache layer: 30s TTL per unit.

PIECE D — Dispatch board GPS column
  DispatchBoard.tsx EDIT: add "Live GPS" column showing lat/lng + recency.
  LoadLivePositionCell.tsx: renders coordinate + stale indicator + 
    "View map" link.

PIECE E — Map view (new route /dispatch/map)
  MapView.tsx: leaflet/mapbox component showing all active loads as pins.
  Pin color: green (moving), gold (stationary <30m), red (stale >5m).
  Click pin → load detail drawer.

PIECE F — Driver PWA own-position
  MyPosition.tsx (new screen): shows driver's own current position + 
    speed + last update. Useful for confirming Samsara tracking active.

PIECE G — CI guard
  verify-cap-1-live-gps.mjs:
    Worker registered, routes registered, DispatchBoard column rendered, 
    MapView route resolves, PWA MyPosition screen present.

PIECE H — Tests
  positions.test.ts: poll worker idempotency, stale detection, RLS, 
    PWA driver self-only access.

PIECE I — Docs
  docs/specs/gap-55-cap-1-live-gps.md

ACCEPTANCE:
[ ] Poll worker runs every 30s without overrun
[ ] All 3 routes return correct data
[ ] DispatchBoard shows live GPS column
[ ] /dispatch/map renders pins for all active loads
[ ] Driver PWA shows own position
[ ] Stale indicator triggers at >5min
[ ] verify-cap-1-live-gps.mjs in CI chain
[ ] Samsara API rate-limit budget respected (<= 60 req/min)

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0 · driver-pwa tsc -b

PAUSE: if Samsara API rate-limit hit, STOP — adjust polling interval before 
       continuing (per CAP foundation, must be sustainable).

POST-MERGE NEXT STEPS: GAP-23 (4-tier cache) will optimize further; 
                       GAP-56 (auto-status switch) consumes this data; 
                       GAP-57 (tri-signal dispatch) consumes this data.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
