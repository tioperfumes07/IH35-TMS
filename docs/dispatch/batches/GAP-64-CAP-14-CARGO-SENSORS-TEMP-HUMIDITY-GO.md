═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-64 — CAP-14 Cargo Temp/Humidity Sensor Integration
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-G  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-63 (Lane A) — same wave P2-G

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-63 owned):
  apps/backend/src/integrations/samsara/cap-13-brake-wear/**
  apps/frontend/src/pages/maintenance/brakes/BrakeWearDashboard.tsx
  apps/frontend/src/pages/maintenance/units/UnitBrakesTab.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0320_cargo_sensor_readings.sql                                  (NEW)
  apps/backend/src/integrations/samsara/cap-14-cargo-sensors/ingester.service.ts (NEW)
  apps/backend/src/integrations/samsara/cap-14-cargo-sensors/threshold.service.ts (NEW)
  apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts       (NEW)
  apps/backend/src/integrations/samsara/cap-14-cargo-sensors/__tests__/      (NEW)
  apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts                        (NEW)
  apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx     (NEW)
  apps/frontend/src/components/dispatch/CargoTempBadge.tsx                   (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                         (EDIT — add badge for reefer loads)
  scripts/verify-cap-14-cargo-sensors.mjs                                    (NEW CI guard)
  docs/specs/gap-64-cap-14-cargo-sensors.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-14 from Samsara Capabilities · Reefer cargo monitoring · 
        Customer compliance (FSMA, USDA) · Claims defense

PROBLEM: Reefer/refrigerated loads carry produce/pharma/etc. with strict 
temp ranges. If reefer fails mid-trip, cargo loss + customer claims. 
Currently no continuous monitoring or out-of-range alerts.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0320
  CREATE TABLE IF NOT EXISTS dispatch.cargo_sensor_readings (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    load_uuid UUID,
    trailer_uuid UUID NOT NULL,
    sensor_id TEXT NOT NULL,
    temp_celsius NUMERIC(6,2),
    humidity_pct NUMERIC(5,2),
    door_status TEXT CHECK (door_status IN ('open','closed','unknown')),
    reading_at TIMESTAMPTZ NOT NULL,
    out_of_range BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_cargo_sensor_load ON dispatch.cargo_sensor_readings(load_uuid, reading_at DESC);
  CREATE INDEX idx_cargo_sensor_out_of_range ON dispatch.cargo_sensor_readings(out_of_range, reading_at DESC) 
    WHERE out_of_range = true;
  GRANT SELECT, INSERT ON dispatch.cargo_sensor_readings TO app_user;

PIECE B — Ingester
  ingester.service.ts:
    Pulls Samsara cargo sensor readings every 5min for active reefer loads
    UPSERT into cargo_sensor_readings
    Cross-references load.required_temp_min/max → marks out_of_range

PIECE C — Threshold service
  threshold.service.ts:
    For each load with reefer cargo:
      load.required_temp_min, load.required_temp_max from booking
    On out-of-range reading:
      Create incident_alert (high severity if duration >10min)
      Notify dispatcher + driver

PIECE D — Worker
  cap-14-cargo-sensor-worker.ts: every 5min for active reefer loads.

PIECE E — Routes
  GET /api/dispatch/cargo-sensors/load/:load_uuid/timeline
  GET /api/dispatch/cargo-sensors/out-of-range?from=&to=

PIECE F — Frontend
  CargoSensorTimeline.tsx: per-load temp/humidity chart over time
  CargoTempBadge.tsx: dispatch board pill (green = in range, amber = at 
    edge, red = out of range)
  DispatchBoard.tsx EDIT: add column for reefer loads.

PIECE G — CI guard
  verify-cap-14-cargo-sensors.mjs: migration, worker, routes, UI present.

PIECE H — Tests
  ingester.test.ts: pull + persist accuracy
  threshold.test.ts: range detection, alert generation, RLS

PIECE I — Docs
  docs/specs/gap-64-cap-14-cargo-sensors.md

ACCEPTANCE:
[ ] Migration 0320 applied
[ ] Worker pulls every 5min for active reefer loads
[ ] Out-of-range detection accurate
[ ] Timeline chart + dispatch badge render
[ ] verify-cap-14-cargo-sensors.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Samsara cargo sensor data unavailable for current trailer fleet, 
       STOP — confirm sensor hardware installed before treating as 
       fleet-wide feature.

POST-MERGE NEXT STEPS: Cargo claims defense uses out-of-range timeline as 
       evidence; insurance loves it.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
