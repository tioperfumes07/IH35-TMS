═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-81 — Drug & Alcohol Program Management Module
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-P  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-82 (Lane B) — same wave P2-P

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-82 owned):
  apps/backend/src/safety/medical-cards-cdl-expiry/**
  apps/frontend/src/pages/safety/expiry-tracking/**

ALLOWED FILES (disjoint from Lane B):
  migrations/0327_drug_alcohol_program.sql                                   (NEW)
  apps/backend/src/safety/drug-alcohol/program.service.ts                    (NEW)
  apps/backend/src/safety/drug-alcohol/random-pool.service.ts                (NEW)
  apps/backend/src/safety/drug-alcohol/routes.ts                             (NEW)
  apps/backend/src/safety/drug-alcohol/__tests__/                            (NEW)
  apps/backend/src/jobs/da-random-pool-draw-worker.ts                        (NEW)
  apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx      (NEW)
  apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx        (NEW)
  apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx        (NEW)
  apps/frontend/src/components/safety/SafetyGroupNav.tsx                     (EDIT — add tab)
  scripts/verify-drug-alcohol-program.mjs                                    (NEW CI guard)
  docs/specs/gap-81-drug-alcohol-program.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: FMCSA Part 382 mandatory program · Pre-employment, random, 
        post-accident, reasonable suspicion, return-to-duty, follow-up

PROBLEM: No centralized tracking of:
  - Driver D&A consortium enrollment
  - Random pool annual draw (10% drug / 10% alcohol minimum)
  - Test results + chain of custody
  - Substance Abuse Professional (SAP) referrals
  - Return-to-duty test sequences
FMCSA audit risk if not documented properly.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0327
  CREATE TABLE IF NOT EXISTS safety.da_program_enrollments (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    consortium_name TEXT NOT NULL,
    enrolled_at DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS safety.da_test_records (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    test_type TEXT CHECK (test_type IN ('pre_employment','random','post_accident','reasonable_suspicion','return_to_duty','follow_up')) NOT NULL,
    test_kind TEXT CHECK (test_kind IN ('drug','alcohol','both')) NOT NULL,
    scheduled_at TIMESTAMPTZ,
    collected_at TIMESTAMPTZ,
    result TEXT CHECK (result IN ('pending','negative','positive','refused','cancelled')),
    chain_of_custody_id TEXT,
    sap_referral_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS safety.da_random_pool_draws (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    draw_date DATE NOT NULL,
    pool_size INTEGER NOT NULL,
    drug_drawn_count INTEGER NOT NULL,
    alcohol_drawn_count INTEGER NOT NULL,
    drawn_driver_uuids UUID[] NOT NULL,
    drawn_test_kinds JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  GRANT SELECT, INSERT, UPDATE ON safety.da_program_enrollments, safety.da_test_records, safety.da_random_pool_draws TO app_user;

PIECE B — Program service
  program.service.ts:
    enrollDriver(driver_uuid, consortium) → enrollment
    scheduleTest(driver_uuid, test_type, test_kind) → test record
    recordResult(test_uuid, result, chain_of_custody_id)
    flagPositive(test_uuid) → triggers SAP referral workflow

PIECE C — Random pool
  random-pool.service.ts:
    drawRandomPool(target_drug_pct=10, target_alcohol_pct=10) →
      Randomly select drivers for current quarter draw
      Cryptographic randomness for audit compliance
      Creates da_random_pool_draws record + da_test_records for each

PIECE D — Worker
  da-random-pool-draw-worker.ts: runs quarterly (1st of Jan/Apr/Jul/Oct).

PIECE E — Routes
  POST   /api/safety/drug-alcohol/enrollments
  GET    /api/safety/drug-alcohol/enrollments
  POST   /api/safety/drug-alcohol/tests
  PATCH  /api/safety/drug-alcohol/tests/:uuid/result
  GET    /api/safety/drug-alcohol/random-pool/draws
  POST   /api/safety/drug-alcohol/random-pool/draw (manual trigger, Safety Officer+)

PIECE F — Frontend
  DrugAlcoholProgramTab.tsx (new Safety tab — Group 1 Driver Files & Training):
    Enrollment list, recent tests, positive results queue
  TestSchedulingPanel.tsx: schedule new tests
  RandomPoolDashboard.tsx: current quarter pool stats + draw history
  SafetyGroupNav.tsx EDIT: add tab (Safety: 23 → 24 tabs)

PIECE G — CI guard
  verify-drug-alcohol-program.mjs: migration, routes, worker, tab present.

PIECE H — Tests
  program.test.ts: enrollment, test recording, SAP referral trigger
  random-pool.test.ts: draw randomness, pool distribution, RLS

PIECE I — Docs
  docs/specs/gap-81-drug-alcohol-program.md (cite FMCSA Part 382)

ACCEPTANCE:
[ ] Migration 0327 applied
[ ] Quarterly worker schedules
[ ] All test types supported
[ ] Random pool draw audit-compliant (cryptographic)
[ ] Positive result triggers SAP workflow
[ ] verify-drug-alcohol-program.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if random pool draw isn't reproducibly auditable (seed not 
       persistent), STOP — FMCSA audit requirement.

POST-MERGE NEXT STEPS: feeds Safety Officer home (GAP-68); chain-of-custody 
       integrates with documents module.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
