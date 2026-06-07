═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-39 — G17 Geofencing Full Backend (3.16 State Machine)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-R  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-38 (Lane A) — same wave G-R

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-38 owned):
  apps/backend/src/safety/damage-reports/**
  apps/frontend/src/pages/safety/damage-reports/**
  migrations/0315_damage_insurance_continuity.sql

ALLOWED FILES (disjoint from Lane A):
  migrations/0316_geofence_state_transitions.sql                             (NEW)
  apps/backend/src/integrations/samsara/geofences/state-machine/states.ts    (NEW)
  apps/backend/src/integrations/samsara/geofences/state-machine/engine.ts    (NEW)
  apps/backend/src/integrations/samsara/geofences/state-machine/transitions.service.ts (NEW)
  apps/backend/src/integrations/samsara/geofences/state-machine/routes.ts    (NEW)
  apps/backend/src/integrations/samsara/geofences/state-machine/__tests__/   (NEW dir)
  apps/backend/src/dispatch/geofences/load-geofence-binding.service.ts       (NEW)
  apps/backend/src/jobs/geofence-state-watcher.ts                            (NEW)
  scripts/verify-geofence-state-machine.mjs                                  (NEW CI guard)
  docs/specs/gap-39-geofence-state-machine.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G17 master rule + Blueprint §3.16 · Geofencing today is event-driven 
        ad-hoc (enter/exit events fire but no formal state) · Per-load 
        geofence binding inconsistent · CAP-2 auto-create on dispatch needs 
        this foundation

PROBLEM: Geofence implementation lacks formal state machine. Loads bound to 
geofences inconsistently. State transitions (approaching → at → departed) 
not modeled. CAP-2/3/4/5 features that depend on geofence state can't 
reliably implement.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0316
  CREATE TABLE IF NOT EXISTS integrations.geofence_state_transitions (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    geofence_uuid UUID NOT NULL,
    vehicle_id TEXT NOT NULL,
    load_uuid UUID,
    stop_uuid UUID,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    transitioned_at TIMESTAMPTZ NOT NULL,
    trigger_source TEXT CHECK (trigger_source IN ('gps_event','manual','timeout','recompute')) NOT NULL,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_gst_vehicle_time ON integrations.geofence_state_transitions(vehicle_id, transitioned_at DESC);
  CREATE INDEX idx_gst_load ON integrations.geofence_state_transitions(load_uuid);
  
  ALTER TABLE integrations.geofences
    ADD COLUMN IF NOT EXISTS current_state TEXT CHECK (current_state IN ('idle','approaching','at','dwelling','departing','departed')) DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS state_updated_at TIMESTAMPTZ;
  GRANT SELECT, INSERT ON integrations.geofence_state_transitions TO app_user;
  GRANT SELECT, UPDATE ON integrations.geofences TO app_user;

PIECE B — State definitions
  states.ts:
    export const GEOFENCE_STATES = ['idle','approaching','at','dwelling','departing','departed'] as const;
    export const VALID_TRANSITIONS = {
      'idle': ['approaching'],
      'approaching': ['at','idle'],
      'at': ['dwelling','departing'],
      'dwelling': ['departing'],
      'departing': ['departed','at'],   // backslide allowed
      'departed': ['idle'],
    };
    export const APPROACHING_RADIUS_M = 2000;  // 2km approach window
    export const DWELL_THRESHOLD_MIN = 5;
    export const DEPARTING_RADIUS_M = 500;

PIECE C — Engine
  engine.ts:
    transitionState(geofence_uuid, vehicle_id, gps_position) →
      Compute proposed state from distance + current state
      Validate transition is legal per VALID_TRANSITIONS
      Persist transition row
      Update integrations.geofences.current_state
      Emit audit_event

PIECE D — Transitions service
  transitions.service.ts:
    Wrapper around engine for batch processing + retries.

PIECE E — Routes
  GET /api/integrations/samsara/geofences/:uuid/state
  GET /api/integrations/samsara/geofences/:uuid/transitions?limit=
  POST /api/integrations/samsara/geofences/:uuid/manual-transition 
       (Owner-only, for repair scenarios)

PIECE F — Load-geofence binding service
  load-geofence-binding.service.ts:
    bindLoadToGeofences(load_uuid) →
      For each stop in load: ensure geofence exists at stop location 
      (auto-create per CAP-2 if missing, 250-ft per GAP-54)
      Link load_uuid in geofence_state_transitions for traceability.

PIECE G — Watcher worker
  geofence-state-watcher.ts:
    Runs every 5min.
    Pulls latest GPS positions, computes state transitions for active 
    geofences, persists.

PIECE H — CI guard
  verify-geofence-state-machine.mjs: migration applied, all 6 states 
    defined, valid transitions enforced, worker registered, routes registered.

PIECE I — Tests
  engine.test.ts: each transition path, invalid transition rejection, 
    state persistence, audit emission.
  transitions.test.ts: batch processing, retry behavior, RLS isolation.

PIECE J — Docs
  docs/specs/gap-39-geofence-state-machine.md (cite §3.16, G17, links to 
  GAP-26 borders, GAP-27 reconciliation, GAP-54 250-ft, GAP-55..57 CAP work)

ACCEPTANCE:
[ ] Migration 0316 applied
[ ] All 6 states valid + transitions enforced
[ ] Watcher runs every 5min
[ ] Routes return correct state per geofence
[ ] Load-geofence binding works
[ ] verify-geofence-state-machine.mjs in CI chain
[ ] No regression on existing geofence event handling

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if invalid transitions occur in test data (e.g. idle→departed direct), 
       STOP — state machine is the wrong abstraction.

POST-MERGE NEXT STEPS: UNBLOCKS CAP-2 auto-geofence (Pass-2 GAP if scoped), 
       CAP-4 auto-status, CAP-5 tri-signal — all depend on this state model.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
