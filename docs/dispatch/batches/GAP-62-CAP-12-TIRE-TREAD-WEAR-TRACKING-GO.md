═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-62 — CAP-12 Tire Tread Wear Tracking
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-F  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-61 (Lane A) — same wave P2-F

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-61 owned):
  apps/backend/src/integrations/fuel/fraud-detector/**
  apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/integrations/samsara/cap-12-tire-tread/measurement.service.ts (NEW)
  apps/backend/src/integrations/samsara/cap-12-tire-tread/projection.service.ts  (NEW)
  apps/backend/src/integrations/samsara/cap-12-tire-tread/routes.ts              (NEW)
  apps/backend/src/integrations/samsara/cap-12-tire-tread/__tests__/             (NEW)
  apps/backend/src/jobs/cap-12-tire-tread-worker.ts                              (NEW)
  apps/frontend/src/pages/maintenance/tires/TireWearDashboard.tsx                (NEW)
  apps/frontend/src/components/maintenance/TireWearProjectionChart.tsx           (NEW)
  apps/frontend/src/pages/maintenance/units/UnitTiresTab.tsx                     (EDIT — add wear)
  migrations/0318_tire_tread_measurements.sql                                    (NEW)
  scripts/verify-cap-12-tire-tread.mjs                                           (NEW CI guard)
  docs/specs/gap-62-cap-12-tire-tread.md                                         (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-12 from Samsara Capabilities · Tread depth tracking + projected 
        replacement date · DOT compliance + safety

PROBLEM: Tire tread depth tracked manually (DVIR field) but not centralized.
No projection of when tires hit replacement threshold (4/32" steer, 2/32" 
drive). Surprise tire failures occur on the road.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0318
  CREATE TABLE IF NOT EXISTS maintenance.tire_tread_measurements (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    unit_uuid UUID NOT NULL,
    tire_position TEXT NOT NULL,  -- LF, RF, LR1, RR1, etc.
    tread_depth_32nds INTEGER NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL,
    measured_by_user_uuid UUID,
    source TEXT CHECK (source IN ('dvir_inspection','maintenance_pm','tire_service','samsara_smart_sensor')) NOT NULL,
    odometer_miles INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_tread_unit_position ON maintenance.tire_tread_measurements(unit_uuid, tire_position, measured_at DESC);
  GRANT SELECT, INSERT ON maintenance.tire_tread_measurements TO app_user;

PIECE B — Measurement service
  measurement.service.ts:
    recordMeasurement({unit_uuid, position, depth_32nds, source})
    getLatestForUnit(unit_uuid) → all positions

PIECE C — Projection service
  projection.service.ts:
    projectReplacementDate(unit_uuid, position) →
      Linear regression on historical measurements + current mileage/day rate
      Returns projected date when tread hits threshold (4 or 2 32nds)

PIECE D — Worker
  cap-12-tire-tread-worker.ts: runs daily, computes projections for all 
    active units, persists to maintenance.tire_projections.

PIECE E — Routes
  POST /api/maintenance/tire-tread/measurements
  GET  /api/maintenance/tire-tread/measurements?unit=&position=
  GET  /api/maintenance/tire-tread/projections?unit=
  GET  /api/maintenance/tire-tread/at-risk?within_days=30

PIECE F — Frontend
  TireWearDashboard.tsx (route /maintenance/tires):
    At-risk units list (replacement projected <30d)
    Filter by axle group (steers / drives / trailers)
  TireWearProjectionChart.tsx: per-tire tread depth trend + projected 
    replacement line
  UnitTiresTab.tsx EDIT: add wear chart to existing tires tab

PIECE G — CI guard
  verify-cap-12-tire-tread.mjs: migration, worker, routes, dashboard 
    + tab render verified.

PIECE H — Tests
  measurement.test.ts: record, query, RLS
  projection.test.ts: regression accuracy >70% on test data, threshold logic

PIECE I — Docs
  docs/specs/gap-62-cap-12-tire-tread.md (cite DOT thresholds)

ACCEPTANCE:
[ ] Migration 0318 applied
[ ] Worker runs daily
[ ] At-risk dashboard renders
[ ] Per-tire projection chart accurate
[ ] verify-cap-12-tire-tread.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Samsara smart sensor feed has different schema than assumed, STOP 
       and inspect actual payload before integrating.

POST-MERGE NEXT STEPS: feeds GAP-17 Arriving Soon queue (tire alerts) and 
       maintenance planning.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
