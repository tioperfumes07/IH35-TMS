═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-71 — Driver Retention Predictive Model
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-K  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-72 (Lane B) — same wave P2-K

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-72 owned):
  apps/backend/src/customers/relationship-score/**
  apps/frontend/src/components/customers/CustomerRelationshipScore.tsx

ALLOWED FILES (disjoint from Lane B):
  migrations/0322_driver_retention_scores.sql                                (NEW)
  apps/backend/src/drivers/retention/feature-extractor.ts                    (NEW)
  apps/backend/src/drivers/retention/scorer.service.ts                       (NEW)
  apps/backend/src/drivers/retention/routes.ts                               (NEW)
  apps/backend/src/drivers/retention/__tests__/                              (NEW)
  apps/backend/src/jobs/driver-retention-scorer-worker.ts                    (NEW)
  apps/frontend/src/pages/drivers/RetentionDashboard.tsx                     (NEW)
  apps/frontend/src/components/drivers/AtRiskDriverCard.tsx                  (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                           (EDIT — add risk badge)
  scripts/verify-driver-retention.mjs                                        (NEW CI guard)
  docs/specs/gap-71-driver-retention-model.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Trucking industry turnover >90% annually 
        · Predict at-risk drivers before they leave · Saves hiring cost

PROBLEM: Drivers leave without warning. Cost to replace = $10K+ each. 
No early signals surfaced today: declining miles, increased late arrivals, 
unanswered comms, declining safety score.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0322
  CREATE TABLE IF NOT EXISTS drivers.retention_scores (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retention_risk_score NUMERIC(5,2) NOT NULL,  -- 0-100 (higher = more at risk)
    retention_tier TEXT CHECK (retention_tier IN ('stable','watch','at_risk','critical')),
    contributing_factors JSONB NOT NULL,
    UNIQUE (driver_uuid, computed_at)
  );
  CREATE INDEX idx_retention_at_risk ON drivers.retention_scores(retention_tier, computed_at DESC)
    WHERE retention_tier IN ('at_risk','critical');
  GRANT SELECT, INSERT ON drivers.retention_scores TO app_user;

PIECE B — Feature extractor
  feature-extractor.ts:
    Per driver, last 90d:
      miles_trend_30d_vs_90d_pct
      late_arrival_rate_30d (from GAP-30)
      unanswered_outbound_comms_count (from GAP-18)
      safety_score_trend (from GAP-60)
      pay_per_mile_actual_vs_promised
      home_time_days_per_month
      complaints_logged_count
      pm_no_show_count

PIECE C — Scorer service
  scorer.service.ts:
    computeRetentionScore(driver_uuid) →
      Weighted sum of features × empirical weights
      Returns risk_score + tier + factors

PIECE D — Worker
  driver-retention-scorer-worker.ts: runs weekly (Mon 4am CT).

PIECE E — Routes
  GET /api/drivers/retention-scores?tier=at_risk
  GET /api/drivers/:uuid/retention-score
  GET /api/drivers/retention-scores/trend?period_weeks=12

PIECE F — Frontend
  RetentionDashboard.tsx (/drivers/retention):
    At-risk + critical drivers list, sortable
    Per-driver: risk score, top 3 factors, last-action timeline
  AtRiskDriverCard.tsx: surfaced on DriverManagerHome (GAP-69)
  DriverDetail.tsx EDIT: add risk badge to header.

PIECE G — CI guard
  verify-driver-retention.mjs: migration, worker, routes, dashboard render.

PIECE H — Tests
  scorer.test.ts: feature extraction accuracy, tier classification, RLS.

PIECE I — Docs
  docs/specs/gap-71-driver-retention-model.md

ACCEPTANCE:
[ ] Migration 0322 applied
[ ] Worker runs weekly
[ ] Risk tiers populate correctly
[ ] Dashboard surfaces at-risk drivers
[ ] verify-driver-retention.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if all drivers cluster in one tier (model not discriminating), 
       STOP and re-tune feature weights.

POST-MERGE NEXT STEPS: Driver Manager (GAP-69) home highlights at-risk 
       drivers for proactive intervention.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
