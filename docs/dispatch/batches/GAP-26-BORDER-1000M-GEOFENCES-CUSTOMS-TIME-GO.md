═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-26 — Border Crossing 1000m Geofences + Customs Clearance Time
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-L  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-27 (Lane B) — same wave G-L

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-27 owned):
  apps/backend/src/integrations/samsara/geofences/reconciliation.service.ts
  apps/backend/src/jobs/geofence-reconciliation-daily.ts

ALLOWED FILES (disjoint from Lane B):
  migrations/0310_border_crossing_events.sql                                 (NEW)
  apps/backend/src/integrations/samsara/border-crossings/detector.service.ts (NEW)
  apps/backend/src/integrations/samsara/border-crossings/customs-time.service.ts (NEW)
  apps/backend/src/integrations/samsara/border-crossings/routes.ts           (NEW)
  apps/backend/src/integrations/samsara/border-crossings/__tests__/          (NEW dir)
  apps/backend/src/jobs/border-crossing-detector.ts                          (NEW worker)
  apps/backend/scripts/seed-border-geofences.mjs                             (NEW one-shot)
  apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx         (NEW)
  apps/frontend/src/components/dispatch/CustomsTimePill.tsx                  (NEW)
  scripts/verify-border-geofence-seed.mjs                                    (NEW CI guard)
  docs/specs/gap-26-border-crossings.md                                      (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge spec — Laredo TX/Mexico crossing detection · Customs time 
        is operational input for HOS planning + scheduling · USMCA carrier 
        (July 2026) makes this critical

PROBLEM: Trucks cross Laredo-Nuevo Laredo border multiple times per day. 
Customs clearance time varies 15min-3hr. No automated tracking → 
dispatchers manually log + can't reliably plan downstream stops. With 
USMCA expansion, this becomes a top-3 operational metric.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0310
  CREATE TABLE IF NOT EXISTS dispatch.border_crossing_events (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    driver_uuid UUID,
    load_uuid UUID,
    crossing_point TEXT CHECK (crossing_point IN ('laredo-i','laredo-ii','laredo-iii','laredo-iv','colombia','other')) NOT NULL,
    direction TEXT CHECK (direction IN ('northbound','southbound')) NOT NULL,
    entered_geofence_at TIMESTAMPTZ NOT NULL,
    exited_geofence_at TIMESTAMPTZ,
    customs_clearance_minutes INTEGER GENERATED ALWAYS AS (
      CASE WHEN exited_geofence_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (exited_geofence_at - entered_geofence_at))/60 
      ELSE NULL END
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_bce_vehicle_time ON dispatch.border_crossing_events(vehicle_id, entered_geofence_at DESC);
  GRANT SELECT, INSERT, UPDATE ON dispatch.border_crossing_events TO app_user;

PIECE B — Border geofence seed
  seed-border-geofences.mjs: inserts 5 geofences into integrations.geofences:
    Laredo Bridge I (Gateway to the Americas)
    Laredo Bridge II (Juarez-Lincoln) 
    Laredo Bridge III (World Trade Bridge)
    Laredo Bridge IV (Colombia Solidarity)
    Colombia Bridge
    Each 1000m radius circular geofence centered on bridge midpoint.

PIECE C — Detector + worker
  detector.service.ts:
    detectCrossings() →
      For each samsara position event:
        If position within any border geofence + new entry → INSERT entered event
        If position outside geofence after entered → UPDATE exited_at
        Auto-link to load_uuid if vehicle has active load
  border-crossing-detector.ts: runs every 5min.

PIECE D — Customs time analytics
  customs-time.service.ts:
    getAverageCustomsTime(crossing_point, direction, last_n_days) → minutes
    getRecentCrossings(vehicle_id, last_n) → events

PIECE E — Routes
  GET /api/dispatch/border-crossings/history?from=&to=&vehicle=
  GET /api/dispatch/border-crossings/customs-time-avg?crossing=&direction=

PIECE F — Frontend
  BorderCrossingHistory.tsx (route /dispatch/borders/history):
    Timeline + per-crossing breakdown + per-driver avg clearance
  CustomsTimePill.tsx: shows on dispatch board when load is in-transit 
    near a border (predicted clearance + actual once measured)

PIECE G — CI guard
  verify-border-geofence-seed.mjs: 5 geofences seeded + named correctly, 
    worker registered, routes registered.

PIECE H — Tests
  detector.test.ts: detection accuracy, auto-link to load, idempotency
  customs-time.test.ts: averaging logic, RLS isolation

PIECE I — Docs
  docs/specs/gap-26-border-crossings.md

ACCEPTANCE:
[ ] Migration 0310 applied
[ ] 5 border geofences seeded
[ ] Worker detects crossings within 5min of GPS event
[ ] Customs time computed correctly
[ ] History page + pill render
[ ] verify-border-geofence-seed.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if geofence coordinates wrong (no detections fire in known crossing 
       data), STOP — coordinates must be verified.

POST-MERGE NEXT STEPS: USMCA July 2026 launch will use this for customs 
       routing decisions; integrates with GAP-39 (geofencing full backend).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
