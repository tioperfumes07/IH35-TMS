═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-59 — CAP-9 Vehicle-Driver Pairing At-Time-of-Event
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-E  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-60 (Lane B) — same wave P2-E

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-60 owned):
  apps/backend/src/safety/driver-scoring/**
  apps/frontend/src/pages/safety/driver-scoring/**

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts (NEW)
  apps/backend/src/integrations/samsara/vehicle-driver-pairing/routes.ts    (NEW)
  apps/backend/src/integrations/samsara/vehicle-driver-pairing/__tests__/   (NEW)
  apps/backend/src/jobs/vehicle-driver-pairing-worker.ts                    (NEW)
  apps/backend/src/lib/at-time-of-event-lookup.ts                           (NEW shared helper)
  migrations/0303_vehicle_driver_assignments.sql                            (NEW)
  scripts/verify-cap-9-pairing.mjs                                          (NEW CI guard)
  docs/specs/gap-59-cap-9-vehicle-driver-pairing.md                         (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-9 from Samsara Capabilities · "Drivers not permanently assigned. 
        Samsara tells us who was in which truck for WO/accident/integrity 
        attribution." · Already in user memory as known gap

PROBLEM: When a WO, accident, damage report, or fuel transaction occurs, 
the system cannot answer "WHO was driving WHICH truck at that exact moment" 
because drivers are not permanently assigned. Samsara has this data via 
driver-card-swipe events; we don't capture it.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0303
  CREATE TABLE IF NOT EXISTS integrations.vehicle_driver_assignments (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    driver_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NULL,
    samsara_assignment_id TEXT UNIQUE,
    source TEXT CHECK (source IN ('samsara_swipe','samsara_login','manual_override')) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_vda_vehicle_time ON integrations.vehicle_driver_assignments(vehicle_id, started_at, ended_at);
  CREATE INDEX idx_vda_driver_time ON integrations.vehicle_driver_assignments(driver_id, started_at, ended_at);
  GRANT SELECT, INSERT, UPDATE ON integrations.vehicle_driver_assignments TO app_user;

PIECE B — Pairing service
  pairing.service.ts:
    syncFromSamsara() → 
      Pull /fleet/drivers/assignments delta from Samsara.
      UPSERT into vehicle_driver_assignments.
      Detect overlaps (driver in 2 vehicles simultaneously) → flag.
    lookupDriverForVehicleAtTime(vehicle_id, at_time) → driver_id or null

PIECE C — Routes
  GET /api/integrations/samsara/pairing/at-event?vehicle_id=&at_time=
  GET /api/integrations/samsara/pairing/driver-history?driver_id=&from=&to=
  POST /api/integrations/samsara/pairing/manual-override (Owner/Safety role)

PIECE D — Shared lookup helper
  at-time-of-event-lookup.ts:
    Exported helper for WO creation, accident creation, fuel txn matching, 
    damage report attribution to call: 
    const driver_id = await lookupDriverForVehicleAtTime(vehicle, event_time)

PIECE E — Background worker
  vehicle-driver-pairing-worker.ts: hourly + on-shift-change webhook.

PIECE F — CI guard
  verify-cap-9-pairing.mjs: table exists, worker registered, routes 
    registered, lookup helper imported by maintenance/safety/fuel modules.

PIECE G — Tests
  pairing.test.ts: lookup at past time, overlap detection, manual override 
    audit, RLS.

PIECE H — Docs
  docs/specs/gap-59-cap-9-vehicle-driver-pairing.md

ACCEPTANCE:
[ ] Migration 0303 applied
[ ] Worker syncs daily without overlap errors
[ ] Lookup helper returns correct driver for past events
[ ] Manual override flow audited
[ ] verify-cap-9-pairing.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if overlap detection finds >5% rows with simultaneous-driver issues, 
       STOP — data quality issue from Samsara needs upstream fix.

POST-MERGE NEXT STEPS: WO creation, accident creation, fuel matching all 
                       auto-populate driver_uuid from this lookup.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
