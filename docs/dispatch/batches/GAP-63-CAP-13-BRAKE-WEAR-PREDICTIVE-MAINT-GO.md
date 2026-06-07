═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-63 — CAP-13 Brake Wear Predictive Maintenance
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-G  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-64 (Lane B) — same wave P2-G

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-64 owned):
  apps/backend/src/integrations/samsara/cap-14-cargo-sensors/**

ALLOWED FILES (disjoint from Lane B):
  migrations/0319_brake_wear_measurements.sql                                (NEW)
  apps/backend/src/integrations/samsara/cap-13-brake-wear/service.ts         (NEW)
  apps/backend/src/integrations/samsara/cap-13-brake-wear/routes.ts          (NEW)
  apps/backend/src/integrations/samsara/cap-13-brake-wear/__tests__/         (NEW)
  apps/backend/src/jobs/cap-13-brake-wear-worker.ts                          (NEW)
  apps/frontend/src/pages/maintenance/brakes/BrakeWearDashboard.tsx          (NEW)
  apps/frontend/src/components/maintenance/BrakeWearGauge.tsx                (NEW)
  apps/frontend/src/pages/maintenance/units/UnitBrakesTab.tsx                (NEW)
  apps/frontend/src/pages/maintenance/units/UnitDetail.tsx                   (EDIT — add tab)
  scripts/verify-cap-13-brake-wear.mjs                                       (NEW CI guard)
  docs/specs/gap-63-cap-13-brake-wear.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-13 from Samsara Capabilities · Brake lining wear + replacement 
        prediction · DOT critical + safety

PROBLEM: Brake pad/lining wear measured at PM intervals only (sparse data).
Predictive replacement projections not surfaced. Brake CSA violations 
preventable with proactive tracking.

SCOPE — ADDITIVE ONLY (mirrors GAP-62 tire pattern):

PIECE A — Migration 0319
  CREATE TABLE IF NOT EXISTS maintenance.brake_wear_measurements (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    unit_uuid UUID NOT NULL,
    brake_position TEXT NOT NULL,  -- LF-S, RF-S (steer), LR1-D, etc.
    lining_thickness_mm NUMERIC(5,2) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL,
    measured_by_user_uuid UUID,
    source TEXT CHECK (source IN ('dvir','pm_inspection','brake_service','samsara_diagnostics')) NOT NULL,
    odometer_miles INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_brake_unit_pos ON maintenance.brake_wear_measurements(unit_uuid, brake_position, measured_at DESC);
  GRANT SELECT, INSERT ON maintenance.brake_wear_measurements TO app_user;

PIECE B — Service
  service.ts:
    recordMeasurement({unit_uuid, position, thickness_mm, source})
    getLatestForUnit(unit_uuid) → all brake positions
    projectReplacement(unit_uuid, position) → projected date
    getAtRiskFleet(within_days=30) → units needing brake service

PIECE C — Worker
  cap-13-brake-wear-worker.ts: runs daily, computes projections.

PIECE D — Routes
  POST /api/maintenance/brake-wear/measurements
  GET  /api/maintenance/brake-wear/measurements?unit=
  GET  /api/maintenance/brake-wear/at-risk?within_days=

PIECE E — Frontend
  BrakeWearDashboard.tsx (/maintenance/brakes): at-risk fleet list
  BrakeWearGauge.tsx: visual gauge per brake position (green/amber/red)
  UnitBrakesTab.tsx: per-unit brake history + projection
  UnitDetail.tsx EDIT: add Brakes tab.

PIECE F — CI guard
  verify-cap-13-brake-wear.mjs: migration, worker, routes, dashboard render.

PIECE G — Tests
  service.test.ts: measurement CRUD, projection accuracy, at-risk logic, RLS.

PIECE H — Docs
  docs/specs/gap-63-cap-13-brake-wear.md (cite DOT brake thresholds)

ACCEPTANCE:
[ ] Migration 0319 applied
[ ] Worker runs daily
[ ] Dashboard + per-unit tab render
[ ] At-risk projection accurate
[ ] verify-cap-13-brake-wear.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Samsara brake diagnostic stream lacks lining thickness data 
       (not all sensor types report), STOP and document limitation; 
       fall back to PM-only measurement source.

POST-MERGE NEXT STEPS: feeds GAP-17 Arriving Soon queue with brake alerts.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
