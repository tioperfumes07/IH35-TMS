═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-80 — CSA BASIC Scores Tab + Tracking
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-O  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-79 (Lane A) — same wave P2-O

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-79 owned):
  apps/backend/src/safety/workers-comp/claim-filing/**
  apps/frontend/src/pages/safety/workers-comp/ClaimFilingWizard.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0326_csa_basic_scores.sql                                       (NEW)
  apps/backend/src/safety/csa-basic-scores/ingest.service.ts                 (NEW)
  apps/backend/src/safety/csa-basic-scores/routes.ts                         (NEW)
  apps/backend/src/safety/csa-basic-scores/__tests__/                        (NEW)
  apps/backend/src/jobs/csa-basic-scores-monthly-ingest.ts                   (NEW)
  apps/frontend/src/pages/safety/csa-basic-scores/CsaBasicScoresTab.tsx      (NEW)
  apps/frontend/src/pages/safety/csa-basic-scores/CsaTrendChart.tsx          (NEW)
  apps/frontend/src/components/safety/SafetyGroupNav.tsx                     (EDIT — add tab)
  scripts/verify-csa-basic-scores.mjs                                        (NEW CI guard)
  docs/specs/gap-80-csa-basic-scores.md                                      (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: FMCSA Compliance, Safety, Accountability program · BASIC = 7 
        scoring categories · Carrier safety profile

PROBLEM: CSA scores (Unsafe Driving, HOS, Driver Fitness, Controlled Subs, 
Vehicle Maint, Crash Indicator, HazMat) update monthly. Carrier health 
visible only via SAFER website. No internal tracking → score drift goes 
unnoticed until investigation.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0326
  CREATE TABLE IF NOT EXISTS safety.csa_basic_scores (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    dot_number TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    unsafe_driving_score NUMERIC(5,2),
    hos_compliance_score NUMERIC(5,2),
    driver_fitness_score NUMERIC(5,2),
    controlled_substances_score NUMERIC(5,2),
    vehicle_maintenance_score NUMERIC(5,2),
    crash_indicator_score NUMERIC(5,2),
    hazmat_compliance_score NUMERIC(5,2),
    intervention_threshold_breached BOOLEAN NOT NULL DEFAULT false,
    breached_basics TEXT[] NOT NULL DEFAULT '{}',
    source TEXT CHECK (source IN ('safer_scrape','manual_entry','fmcsa_api')) NOT NULL,
    raw_data JSONB,
    UNIQUE (dot_number, snapshot_date)
  );
  CREATE INDEX idx_csa_dot_date ON safety.csa_basic_scores(dot_number, snapshot_date DESC);
  GRANT SELECT, INSERT ON safety.csa_basic_scores TO app_user;

PIECE B — Ingest service
  ingest.service.ts:
    monthlyIngest(dot_number) →
      Scrapes SAFER website OR FMCSA API (if access available)
      Parses 7 BASIC scores
      Stores snapshot
      Detects threshold breach (any score > intervention threshold)

PIECE C — Worker
  csa-basic-scores-monthly-ingest.ts: runs 1st of each month.

PIECE D — Routes
  GET /api/safety/csa-basic-scores?dot_number=&from=&to=
  GET /api/safety/csa-basic-scores/latest?dot_number=

PIECE E — Frontend
  CsaBasicScoresTab.tsx (new Safety tab — Group 1 Driver Files & Training):
    Latest scores card (7 BASICs)
    Trend chart over time
    Breach alerts
  CsaTrendChart.tsx: per-BASIC line chart with threshold line
  SafetyGroupNav.tsx EDIT: add tab (Safety: 22 → 23 tabs WHEN GAP-9 and 
    GAP-60 are both shipped; ensure GAP-9 sequencing first)

PIECE F — CI guard
  verify-csa-basic-scores.mjs: migration, worker, routes, tab present.

PIECE G — Tests
  ingest.test.ts: scraping/API parsing, threshold detection, RLS.

PIECE H — Docs
  docs/specs/gap-80-csa-basic-scores.md (cite FMCSA spec)

ACCEPTANCE:
[ ] Migration 0326 applied
[ ] Worker runs monthly
[ ] Scores ingested for active DOT numbers (TRK + TRANSP)
[ ] Tab renders with current + trend
[ ] Breach detection works
[ ] verify-csa-basic-scores.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if SAFER scrape blocked or FMCSA API unavailable, STOP and confirm 
       data source with Jorge.

POST-MERGE NEXT STEPS: Safety Officer home (GAP-68) surfaces breaches.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
