═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-42 — IFTA 4-Step Quarterly Preparer + Owner-Only WF-064
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-T  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-43 (Lane B) — same wave G-T

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-43 owned):
  apps/backend/src/reports/scheduled/**
  apps/backend/src/jobs/scheduled-reports-emailer.ts

ALLOWED FILES (disjoint from Lane B):
  migrations/0317_ifta_filings.sql                                           (NEW)
  apps/backend/src/reports/ifta/quarterly-preparer.service.ts                (NEW)
  apps/backend/src/reports/ifta/mileage-aggregator.service.ts                (NEW)
  apps/backend/src/reports/ifta/fuel-aggregator.service.ts                   (NEW)
  apps/backend/src/reports/ifta/routes.ts                                    (NEW)
  apps/backend/src/reports/ifta/__tests__/                                   (NEW dir)
  apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx            (NEW)
  apps/frontend/src/components/reports/ifta/StepWizard.tsx                   (NEW)
  apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx           (NEW)
  apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx              (NEW)
  apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx       (NEW)
  apps/frontend/src/components/reports/ifta/Step4FinalReview.tsx             (NEW)
  scripts/verify-ifta-quarterly-preparer.mjs                                 (NEW CI guard)
  docs/specs/gap-42-ifta-quarterly-preparer.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: P8-IFTA Phase 8 + ChatGPT execution plan · IFTA quarterly filing 
        currently 100% manual (spreadsheet) · Owner only role per WF-064 
        2-step confirmation for filing submission

PROBLEM: IFTA (International Fuel Tax Agreement) quarterly filing requires:
  - Per-jurisdiction miles driven
  - Per-jurisdiction fuel purchased
  - Tax computation per jurisdiction rate
  - Net tax owed/refunded calculation
Currently dispatcher exports CSVs from TMS + QBO and prepares in Excel. 
Error-prone, slow, no audit trail.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0317
  CREATE TABLE IF NOT EXISTS reports.ifta_filings (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    quarter TEXT NOT NULL,  -- "2026-Q2"
    status TEXT CHECK (status IN ('draft','review','owner_approved','filed')) NOT NULL,
    filing_data JSONB NOT NULL,
    prepared_by_user_uuid UUID NOT NULL,
    approved_by_user_uuid UUID,
    approved_at TIMESTAMPTZ,
    filed_at TIMESTAMPTZ,
    confirmation_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (operating_company_id, quarter)
  );
  GRANT SELECT, INSERT, UPDATE ON reports.ifta_filings TO app_user;

PIECE B — Backend services
  mileage-aggregator.service.ts:
    aggregateMilesByJurisdiction(operating_company_id, quarter) →
      Join dispatch.loads + dispatch.stops + state crossings
      Returns: {TX: 12450, OK: 3200, AR: 1800, ...}
  fuel-aggregator.service.ts:
    aggregateFuelByJurisdiction(operating_company_id, quarter) →
      Join fuel.transactions WHERE date in quarter
      Returns: {TX: 5500, OK: 1200, ...}
  quarterly-preparer.service.ts:
    prepareFiling(operating_company_id, quarter) →
      Combines mileage + fuel + jurisdiction rates (from IRS IFTA catalog)
      Computes tax owed/refund per jurisdiction
      Returns full filing object + writes to reports.ifta_filings as draft.

PIECE C — Routes
  POST /api/reports/ifta/prepare body: {quarter}
  GET  /api/reports/ifta/draft/:uuid
  POST /api/reports/ifta/draft/:uuid/owner-approve (Owner role + WF-064 confirm)
  POST /api/reports/ifta/draft/:uuid/mark-filed body: {confirmation_number}
  GET  /api/reports/ifta/filings (history)

PIECE D — Frontend 4-step wizard
  IftaPreparer.tsx: hosts StepWizard.tsx
  Step1MileageReview.tsx: per-jurisdiction miles table, edit overrides
  Step2FuelReview.tsx: per-jurisdiction fuel table, edit overrides  
  Step3JurisdictionCalc.tsx: tax calc preview with current rates
  Step4FinalReview.tsx: summary + Owner WF-064 2-step confirmation 
    (lightning-bolt → Yes/Yes confirm) → submit + audit

PIECE E — CI guard
  verify-ifta-quarterly-preparer.mjs: migration applied, all 4 steps render, 
    Owner-only RBAC enforced, WF-064 confirmation flow wired.

PIECE F — Tests
  mileage-aggregator.test.ts: per-jurisdiction split accuracy
  fuel-aggregator.test.ts: per-jurisdiction split accuracy
  quarterly-preparer.test.ts: tax calc accuracy, Owner-only enforcement, 
    audit chain, RLS isolation
  WF-064 confirmation flow integration test

PIECE G — Docs
  docs/specs/gap-42-ifta-quarterly-preparer.md (cite P8-IFTA, WF-064, 
  rate source URL)

ACCEPTANCE:
[ ] Migration 0317 applied
[ ] 4-step wizard renders + functions
[ ] Mileage + fuel aggregation accurate
[ ] Tax calc matches IFTA rates
[ ] Owner-only WF-064 2-step confirm enforced
[ ] Filing draft → owner_approved → filed lifecycle works
[ ] verify-ifta-quarterly-preparer.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any jurisdiction rate hardcoded vs catalog, STOP — must source 
       from IRS-published IFTA rate catalog (annual updates).

POST-MERGE NEXT STEPS: feeds Tax & Regulatory category in Reports Hub (GAP-41).
       GAP-66 Form 2290 follows similar pattern for heavy-truck tax.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
