═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-60 — CAP-10 Driver Scoring Page in Safety Module
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-E  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-59 (Lane A) — same wave P2-E

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-59 owned):
  apps/backend/src/integrations/samsara/vehicle-driver-pairing/**
  apps/backend/src/jobs/vehicle-driver-pairing-worker.ts
  apps/backend/src/lib/at-time-of-event-lookup.ts
  migrations/0303_vehicle_driver_assignments.sql

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/safety/driver-scoring/scoring.service.ts                 (NEW)
  apps/backend/src/safety/driver-scoring/scoring.routes.ts                  (NEW)
  apps/backend/src/safety/driver-scoring/__tests__/scoring.test.ts          (NEW)
  apps/backend/src/safety/driver-scoring/composite-score.ts                 (NEW)
  apps/backend/src/jobs/driver-scoring-aggregator-worker.ts                 (NEW)
  apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx        (NEW)
  apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx       (NEW)
  apps/frontend/src/components/safety/SafetyGroupNav.tsx                    (EDIT — add tab)
  migrations/0304_driver_safety_scores.sql                                  (NEW)
  scripts/verify-cap-10-driver-scoring.mjs                                  (NEW CI guard)
  docs/specs/gap-60-cap-10-driver-scoring.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-10 from Samsara Capabilities · "Harsh braking, hard accel, 
        speeding, lane departure scores." · NOT BUILT

PROBLEM: Safety module has DVIR, HOS, accidents — but no aggregated driver 
behavior scoring. Samsara reports per-event safety incidents (harsh brake, 
hard accel, speeding) but we don't surface them as per-driver composite 
score, trend, or comparable metric.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0304
  CREATE TABLE IF NOT EXISTS safety.driver_safety_scores (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    harsh_brake_count INTEGER NOT NULL DEFAULT 0,
    hard_accel_count INTEGER NOT NULL DEFAULT 0,
    speeding_seconds INTEGER NOT NULL DEFAULT 0,
    lane_departure_count INTEGER NOT NULL DEFAULT 0,
    miles_driven NUMERIC(10,2) NOT NULL DEFAULT 0,
    composite_score NUMERIC(5,2),  -- 0-100 (higher is safer)
    rank_in_fleet INTEGER,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (driver_uuid, period_start, period_end)
  );
  CREATE INDEX idx_safety_scores_driver_period ON safety.driver_safety_scores(driver_uuid, period_end DESC);
  GRANT SELECT, INSERT ON safety.driver_safety_scores TO app_user;

PIECE B — Composite score function
  composite-score.ts:
    computeScore({harsh_brake_per_100mi, hard_accel_per_100mi, 
                  speeding_pct, lane_departure_per_100mi}) → 0-100
    Weights: brake 30%, accel 25%, speeding 25%, lane 20%.
    Anti-game: requires min 500 miles/period to score.

PIECE C — Aggregator service + worker
  scoring.service.ts:
    aggregateForPeriod(driver_uuid, period_start, period_end) → 
      Joins integrations.samsara_safety_events ⨝ vehicle_driver_assignments
      Computes composite, writes to safety.driver_safety_scores.
      Computes rank_in_fleet across active drivers.
  driver-scoring-aggregator-worker.ts: runs weekly (Mon 3am CT).

PIECE D — Routes
  GET /api/safety/driver-scoring/period?from=&to=  (fleet leaderboard)
  GET /api/safety/driver-scoring/driver/:uuid?periods=12 (per-driver trend)

PIECE E — Frontend
  DriverScoringTab.tsx (new Safety tab in Group 1):
    Leaderboard table: rank, driver, composite score, breakdown counts.
    Filter: period (week / month / quarter).
  DriverScoreDetail.tsx: per-driver page with 12-week trend chart + 
    raw event drilldown.
  SafetyGroupNav.tsx EDIT: add Driver Scoring tab to Group 1 
    (Safety total: 21 → 22 tabs after this AND GAP-9 ships).

PIECE F — CI guard
  verify-cap-10-driver-scoring.mjs: migration + routes + tab + worker registered.

PIECE G — Tests
  scoring.test.ts: composite calc, min-miles guard, leaderboard query, 
    trend query, RLS.

PIECE H — Docs
  docs/specs/gap-60-cap-10-driver-scoring.md

ACCEPTANCE:
[ ] Migration 0304 applied
[ ] Worker runs weekly + populates table
[ ] Leaderboard renders with correct ranking
[ ] Per-driver trend chart accurate
[ ] Driver Scoring tab appears in Safety > Driver Files & Training group
[ ] verify-cap-10-driver-scoring.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Safety tab count exceeds 22 after this + GAP-9 ship, STOP — 
       Jorge directive specifies exact count.

POST-MERGE NEXT STEPS: Owner can use scores for driver-pay bonuses 
                       (consumer of GAP-74 retention model).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
