═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-84 — DOT Inspection History + Score Tracking
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-Q  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-83 (Lane A) — same wave P2-Q

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-83 owned):
  apps/backend/src/safety/eld-audit-trail/**
  apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0328_dot_inspection_history.sql                                 (NEW)
  apps/backend/src/safety/inspection-history/service.ts                      (NEW)
  apps/backend/src/safety/inspection-history/routes.ts                       (NEW)
  apps/backend/src/safety/inspection-history/__tests__/                      (NEW)
  apps/frontend/src/pages/safety/inspection-history/InspectionHistoryTab.tsx (NEW)
  apps/frontend/src/pages/safety/inspection-history/InspectionCreate.tsx     (NEW)
  apps/frontend/src/components/safety/InspectionScoreBadge.tsx               (NEW)
  apps/frontend/src/components/safety/SafetyGroupNav.tsx                     (EDIT — add tab)
  scripts/verify-dot-inspection-history.mjs                                  (NEW CI guard)
  docs/specs/gap-84-dot-inspection-history.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: FMCSA roadside inspection compliance · Each inspection 
        (Level I-VI) generates a score that feeds CSA · No internal 
        tracking today

PROBLEM: When driver gets pulled in by DOT for inspection (roadside or 
weigh station), inspection results not tracked centrally. Out-of-service 
findings missed. Scores feeding into CSA invisible.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0328
  CREATE TABLE IF NOT EXISTS safety.dot_inspections (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    unit_uuid UUID NOT NULL,
    inspection_level INTEGER CHECK (inspection_level BETWEEN 1 AND 6) NOT NULL,
    inspection_date DATE NOT NULL,
    inspection_location TEXT,
    inspector_id TEXT,
    inspector_state TEXT,
    out_of_service_driver BOOLEAN NOT NULL DEFAULT false,
    out_of_service_vehicle BOOLEAN NOT NULL DEFAULT false,
    violations JSONB NOT NULL DEFAULT '[]',
    violation_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(violations)) STORED,
    csa_score_impact NUMERIC(6,2),
    report_pdf_evidence_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_user_uuid UUID
  );
  CREATE INDEX idx_inspection_driver ON safety.dot_inspections(driver_uuid, inspection_date DESC);
  CREATE INDEX idx_inspection_unit ON safety.dot_inspections(unit_uuid, inspection_date DESC);
  GRANT SELECT, INSERT, UPDATE ON safety.dot_inspections TO app_user;

PIECE B — Service
  service.ts:
    recordInspection(data) → inspection_uuid
    getDriverHistory(driver_uuid) → all inspections
    getUnitHistory(unit_uuid) → all inspections
    computeCleanRollingRate(driver_uuid, last_n_months) → clean inspections %

PIECE C — Routes
  POST /api/safety/dot-inspections
  GET  /api/safety/dot-inspections?driver=&unit=&from=
  GET  /api/safety/dot-inspections/clean-rate/driver/:uuid

PIECE D — Frontend
  InspectionHistoryTab.tsx (new Safety tab — Group 2 Hours & Inspection):
    Recent inspections list
    Filter by driver / unit / out-of-service
  InspectionCreate.tsx: form to record inspection + upload report PDF 
    (uses GAP-11 DocumentUploadWidget)
  InspectionScoreBadge.tsx: on DriverDetail showing clean rate %
  SafetyGroupNav.tsx EDIT: add tab (Safety: 25 → 26 tabs)

PIECE E — CI guard
  verify-dot-inspection-history.mjs: migration, routes, tab present.

PIECE F — Tests
  service.test.ts: record, history, clean rate calc, RLS.

PIECE G — Docs
  docs/specs/gap-84-dot-inspection-history.md (cite FMCSA inspection levels)

ACCEPTANCE:
[ ] Migration 0328 applied
[ ] Inspection recording + PDF upload works
[ ] Driver/unit history tabs render
[ ] Clean rate calc accurate
[ ] verify-dot-inspection-history.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if PDF evidence upload fails, STOP — chain of custody required for 
       inspection records.

POST-MERGE NEXT STEPS: integrates with CSA BASIC scores (GAP-80) — 
       inspections feed CSA snapshot.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
