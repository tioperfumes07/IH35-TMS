═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-28 — Layover Time Computation (>8h Gap)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-M  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-29 (Lane B) — same wave G-M

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-29 owned):
  apps/backend/src/dispatch/analytics/booking-gap.service.ts
  apps/frontend/src/pages/reports/BookingGapReport.tsx

ALLOWED FILES (disjoint from Lane B):
  migrations/0311_driver_layovers.sql                                        (NEW)
  apps/backend/src/dispatch/layovers/detection.service.ts                    (NEW)
  apps/backend/src/dispatch/layovers/routes.ts                               (NEW)
  apps/backend/src/dispatch/layovers/__tests__/layovers.test.ts              (NEW)
  apps/backend/src/jobs/layover-detector-worker.ts                           (NEW)
  apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx                   (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                           (EDIT — add layover summary)
  scripts/verify-layover-detection.mjs                                       (NEW CI guard)
  docs/specs/gap-28-layover-detection.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: WF-053 multi-stop consolidation · Layover billing requires 
        detection · Driver pay calc may include layover allowance

PROBLEM: When >8h gap between load delivery and next pickup, driver is
on layover. Currently:
  - No automated detection
  - Some loads should include layover charge to customer
  - Drivers may need per-diem
  - Pattern only visible by hand-checking dispatch sequence

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0311
  CREATE TABLE IF NOT EXISTS dispatch.driver_layovers (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    previous_load_uuid UUID NOT NULL,
    next_load_uuid UUID,
    layover_started_at TIMESTAMPTZ NOT NULL,
    layover_ended_at TIMESTAMPTZ,
    duration_hours NUMERIC(6,2) GENERATED ALWAYS AS (
      CASE WHEN layover_ended_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (layover_ended_at - layover_started_at))/3600 
      ELSE NULL END
    ) STORED,
    layover_location TEXT,
    billable_to_customer BOOLEAN NOT NULL DEFAULT false,
    per_diem_eligible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_layover_driver ON dispatch.driver_layovers(driver_uuid, layover_started_at DESC);
  GRANT SELECT, INSERT, UPDATE ON dispatch.driver_layovers TO app_user;

PIECE B — Detection service
  detection.service.ts:
    detectLayovers() →
      For each driver: 
        Look at consecutive completed loads
        If gap between delivery_at and next assignment_at > 8h:
          Create driver_layovers row
      Returns count.

PIECE C — Worker
  layover-detector-worker.ts: runs every 6h.

PIECE D — Routes
  GET /api/dispatch/layovers?driver=&from=&to=
  PATCH /api/dispatch/layovers/:uuid/mark-billable (Manager+ role)
  PATCH /api/dispatch/layovers/:uuid/per-diem-exclude (Owner role)

PIECE E — Frontend
  DriverLayoverHistory.tsx: per-driver layover list with billable flag
  DriverDetail.tsx EDIT: add layover summary card 
    (total layover hours / paid per-diem amount last 30 days)

PIECE F — CI guard
  verify-layover-detection.mjs: worker registered, routes registered, 
    page renders.

PIECE G — Tests
  layovers.test.ts: detection accuracy, billable flag flow, RLS.

PIECE H — Docs
  docs/specs/gap-28-layover-detection.md

ACCEPTANCE:
[ ] Migration 0311 applied
[ ] Worker runs every 6h
[ ] Layovers detected accurately (>8h threshold)
[ ] Billable flow Manager-only
[ ] Per-diem flow Owner-only
[ ] verify-layover-detection.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if false positives detected (HOS reset miscount as layover), STOP — 
       must distinguish actual layover from required HOS rest.

POST-MERGE NEXT STEPS: feeds driver settlement (per-diem inclusion) + 
       customer invoice (layover billable line).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
