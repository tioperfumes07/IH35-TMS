═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-77 — Fuel Price Optimization Routing
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-N  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-78 (Lane B) — same wave P2-N

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-78 owned):
  apps/backend/src/fuel/iftap-quarterly/**
  apps/frontend/src/pages/fuel/iftap/IftapQuarterlyReport.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/fuel/route-optimizer/price-api.service.ts                 (NEW)
  apps/backend/src/fuel/route-optimizer/route-planner.service.ts             (NEW)
  apps/backend/src/fuel/route-optimizer/routes.ts                            (NEW)
  apps/backend/src/fuel/route-optimizer/__tests__/                           (NEW)
  apps/backend/src/jobs/fuel-price-refresh-worker.ts                         (NEW)
  apps/frontend/src/pages/fuel/route-optimizer/RouteOptimizerPanel.tsx       (NEW)
  apps/frontend/src/pages/dispatch/loads/LoadDetail.tsx                      (EDIT — embed panel)
  migrations/0325_fuel_station_prices.sql                                    (NEW)
  scripts/verify-fuel-route-optimizer.mjs                                    (NEW CI guard)
  docs/specs/gap-77-fuel-route-optimization.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Driver fueling cheapest stations = 
        material savings · Comdata/EFS provide station price feeds

PROBLEM: Driver fills wherever convenient. Often pays $0.30-0.50/gal 
premium over closest cheap station. No system telling driver WHERE to fuel.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0325
  CREATE TABLE IF NOT EXISTS fuel.station_prices (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL,
    chain TEXT,
    lat NUMERIC(10,6) NOT NULL,
    lng NUMERIC(10,6) NOT NULL,
    diesel_price_per_gallon NUMERIC(6,3) NOT NULL,
    discount_pct NUMERIC(5,2),
    network_card TEXT CHECK (network_card IN ('comdata','efs','tcheck','wex','none')),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_station_loc ON fuel.station_prices(lat, lng);
  CREATE INDEX idx_station_price ON fuel.station_prices(diesel_price_per_gallon);
  GRANT SELECT, INSERT, UPDATE ON fuel.station_prices TO app_user;

PIECE B — Price API
  price-api.service.ts:
    refreshFromComdataApi() / refreshFromEfsApi()
    Pulls current diesel prices for stations in our network
    UPSERT into fuel.station_prices

PIECE C — Route planner
  route-planner.service.ts:
    optimizeFuelStops(load_uuid, current_fuel_pct=40) →
      Given load route + tank capacity + current fuel level
      Suggests fuel stops to minimize total cost
      Returns [{station_id, eta_at_station, gallons_to_fill, expected_cost}]

PIECE D — Worker
  fuel-price-refresh-worker.ts: hourly refresh of prices.

PIECE E — Routes
  GET  /api/fuel/route-optimizer/suggest?load=&current_fuel_pct=
  POST /api/fuel/route-optimizer/refresh-prices (manual)

PIECE F — Frontend
  RouteOptimizerPanel.tsx: shows recommended stops on load route
  LoadDetail.tsx EDIT: embed panel in load detail page (operator + driver 
    PWA can view)

PIECE G — CI guard
  verify-fuel-route-optimizer.mjs: migration, worker, routes, UI.

PIECE H — Tests
  price-api.test.ts: parsing accuracy from each network
  route-planner.test.ts: optimization correctness, edge cases (no nearby 
    cheap stations), RLS

PIECE I — Docs
  docs/specs/gap-77-fuel-route-optimization.md

ACCEPTANCE:
[ ] Migration 0325 applied
[ ] Hourly refresh from at least one network (Comdata or EFS)
[ ] Optimizer suggests valid stops
[ ] Panel renders in LoadDetail
[ ] verify-fuel-route-optimizer.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if network API auth fails, STOP — verify card credentials.

POST-MERGE NEXT STEPS: driver PWA can show suggestions during route.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
