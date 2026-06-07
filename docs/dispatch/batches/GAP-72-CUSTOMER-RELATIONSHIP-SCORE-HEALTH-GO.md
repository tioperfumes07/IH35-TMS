═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-72 — Customer Relationship Score + Health Indicator
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-K  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-71 (Lane A) — same wave P2-K

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-71 owned):
  apps/backend/src/drivers/retention/**
  apps/frontend/src/pages/drivers/RetentionDashboard.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0323_customer_relationship_scores.sql                           (NEW)
  apps/backend/src/customers/relationship-score/scorer.service.ts            (NEW)
  apps/backend/src/customers/relationship-score/routes.ts                    (NEW)
  apps/backend/src/customers/relationship-score/__tests__/                   (NEW)
  apps/backend/src/jobs/customer-relationship-scorer.ts                      (NEW)
  apps/frontend/src/components/customers/CustomerRelationshipScore.tsx       (NEW)
  apps/frontend/src/pages/customers/CustomerDetail.tsx                       (EDIT — add card)
  apps/frontend/src/pages/customers/CustomerList.tsx                         (EDIT — add column)
  scripts/verify-customer-relationship-score.mjs                             (NEW CI guard)
  docs/specs/gap-72-customer-relationship-score.md                           (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Customer health = combines engagement
        (GAP-36), payment behavior (DSO), late-arrival impact (GAP-30), 
        rate trend (GAP-35)

PROBLEM: Engagement score (GAP-36) measures activity volume only. 
Doesn't capture: payment timing (DSO), service quality satisfaction, 
margin trend (rates declining?), complaint count. Need holistic health.

SCOPE — ADDITIVE ONLY (composes GAP-36, GAP-35, GAP-30):

PIECE A — Migration 0323
  CREATE TABLE IF NOT EXISTS master_data.customer_relationship_scores (
    customer_uuid UUID PRIMARY KEY,
    operating_company_id TEXT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    overall_health_score NUMERIC(5,2) NOT NULL,  -- 0-100
    health_tier TEXT CHECK (health_tier IN ('thriving','healthy','watch','at_risk')),
    engagement_subscore NUMERIC(5,2),  -- from GAP-36
    payment_behavior_subscore NUMERIC(5,2),  -- DSO-based
    service_quality_subscore NUMERIC(5,2),  -- late arrival impact
    margin_trend_subscore NUMERIC(5,2),  -- rate erosion
    complaint_subscore NUMERIC(5,2)
  );
  GRANT SELECT, INSERT, UPDATE ON master_data.customer_relationship_scores TO app_user;

PIECE B — Scorer
  scorer.service.ts:
    computeRelationshipScore(customer_uuid) →
      engagement = score from GAP-36 (already computed)
      payment_behavior = 100 - normalize(avg_dso_30d)
      service_quality = 100 - normalize(late_arrival_pct_30d)  
      margin_trend = compare(rate_per_mile_30d, rate_per_mile_180d)
      complaint = 100 - normalize(complaint_count_30d)
      overall = weighted avg (engagement 25%, payment 30%, service 25%, 
               margin 10%, complaint 10%)
      Tier rules: 
        thriving >= 85, healthy >= 65, watch >= 45, at_risk < 45

PIECE C — Worker
  customer-relationship-scorer.ts: runs every 6h.

PIECE D — Routes
  GET /api/customers/:uuid/relationship-score
  GET /api/customers/relationship-scores/at-risk

PIECE E — Frontend
  CustomerRelationshipScore.tsx: card showing tier + subscores breakdown
  CustomerDetail.tsx EDIT: add card to header
  CustomerList.tsx EDIT: add "Health" column with tier pill

PIECE F — CI guard
  verify-customer-relationship-score.mjs: migration, worker, routes, UI.

PIECE G — Tests
  scorer.test.ts: weighted calc, tier classification, RLS.

PIECE H — Docs
  docs/specs/gap-72-customer-relationship-score.md

ACCEPTANCE:
[ ] Migration 0323 applied
[ ] Worker runs every 6h
[ ] All 5 subscores compute
[ ] Tier classification produces realistic distribution
[ ] verify-customer-relationship-score.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any subscore source unavailable (GAP-36/30/35 not shipped), 
       graceful degrade with that subscore=null.

POST-MERGE NEXT STEPS: Sales/Account Management can use for prioritization.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
