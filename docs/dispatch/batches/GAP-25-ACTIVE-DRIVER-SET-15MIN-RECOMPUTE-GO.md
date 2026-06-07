═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-25 — Active Driver Set 15-min Recompute + Dashboard Declutter
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-K  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-24 (Lane A) — same wave G-K

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-24 owned):
  apps/backend/src/integrations/samsara/freshness-budget.*
  apps/frontend/src/components/shared/FreshnessIndicator.tsx
  apps/frontend/src/lib/freshness-indicator.ts

ALLOWED FILES (disjoint from Lane A):
  migrations/0309_active_driver_set_cache.sql                                (NEW)
  apps/backend/src/integrations/samsara/active-driver-set/recompute.service.ts (NEW)
  apps/backend/src/integrations/samsara/active-driver-set/query.service.ts   (NEW)
  apps/backend/src/integrations/samsara/active-driver-set/routes.ts          (NEW)
  apps/backend/src/integrations/samsara/active-driver-set/__tests__/         (NEW dir)
  apps/backend/src/jobs/active-driver-set-recompute.ts                       (NEW worker)
  apps/frontend/src/pages/safety/SafetyHome.tsx                              (EDIT — declutter filter)
  scripts/verify-active-driver-set.mjs                                       (NEW CI guard)
  docs/specs/gap-25-active-driver-set.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G25 master rule · Safety dashboard active filter declutter · 
        "default filter: drivers active within past 7-10 days" already 
        shipped UI-side, but backend computes ad-hoc per request 
        (expensive scan)

PROBLEM: Safety home filters to "active drivers in past 7-10 days" by 
scanning samsara_drivers + activity log at query time. With 25 drivers
that's fine; with USMCA-scale (40+) the scan time grows. Need cached 
active-driver-set recomputed every 15min.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0309
  CREATE TABLE IF NOT EXISTS integrations.active_driver_set_cache (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    threshold_days INTEGER NOT NULL,
    active_driver_uuids UUID[] NOT NULL,
    total_driver_count INTEGER NOT NULL
  );
  CREATE INDEX idx_adset_snapshot ON integrations.active_driver_set_cache(operating_company_id, snapshot_at DESC);
  GRANT SELECT, INSERT ON integrations.active_driver_set_cache TO app_user;

PIECE B — Recompute service
  recompute.service.ts:
    recomputeActiveDriverSet(operating_company_id, threshold_days = 7) →
      Query samsara_drivers + samsara_hos_clocks + samsara_safety_events
      Find drivers with activity in last `threshold_days` days
      INSERT new snapshot row
      Retains last 30 snapshots per OCI for trending

PIECE C — Query service
  query.service.ts:
    getActiveDrivers(operating_company_id, max_age_minutes=15) →
      Returns latest snapshot if fresh
      If stale, falls back to recompute (synchronous)

PIECE D — Worker
  active-driver-set-recompute.ts: runs every 15min for each active OCI.

PIECE E — Routes
  GET /api/integrations/samsara/active-drivers
  POST /api/integrations/samsara/active-drivers/recompute (manual trigger)

PIECE F — Frontend declutter
  SafetyHome.tsx EDIT: 
    Default filter already shows "active in 7d"; this block makes it FAST.
    Add freshness indicator (consumes GAP-24 budget infrastructure).
    Filter dropdown options: 7d (default) / 14d / 30d / All.

PIECE G — CI guard
  verify-active-driver-set.mjs: migration applied, worker registered, 
    routes registered, SafetyHome uses cached query path.

PIECE H — Tests
  recompute.test.ts: snapshot creation, retention (30 max), threshold logic
  query.test.ts: fresh hit, stale fallback, RLS isolation

PIECE I — Docs
  docs/specs/gap-25-active-driver-set.md

ACCEPTANCE:
[ ] Migration 0309 applied
[ ] Worker recomputes every 15min
[ ] SafetyHome loads <100ms (vs prior >800ms ad-hoc scan)
[ ] Filter dropdown supports 7d/14d/30d/All
[ ] verify-active-driver-set.mjs in CI chain
[ ] No regression on existing active-filter UI

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if cache invalidation slips (stale data shown >30min), STOP — 
       worker reliability needs verification.

POST-MERGE NEXT STEPS: pattern reusable for any active-set computation 
       (active units, active customers, etc.)

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
