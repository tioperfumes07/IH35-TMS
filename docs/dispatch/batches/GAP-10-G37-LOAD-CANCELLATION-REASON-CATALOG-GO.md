═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-10 — G37 Load Cancellation Reason Catalog
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-D  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-9 (Lane A) — same wave G-D

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-9 owned):
  apps/backend/src/safety/**
  apps/frontend/src/pages/safety/**
  migrations/0299_safety_workers_comp_hos_split.sql

ALLOWED FILES (disjoint from Lane A):
  migrations/0300_cancel_reasons_catalog.sql                                (NEW)
  apps/backend/src/dispatch/loads/cancel/cancel-reasons.routes.ts           (NEW)
  apps/backend/src/dispatch/loads/cancel/cancel-load.service.ts             (EDIT — require reason)
  apps/backend/src/dispatch/loads/cancel/__tests__/cancel-reasons.test.ts   (NEW)
  apps/frontend/src/components/dispatch/CancelLoadModal.tsx                 (EDIT — add dropdown)
  apps/frontend/src/pages/reports/LoadCancellationsReport.tsx               (NEW)
  apps/backend/src/reports/load-cancellations.routes.ts                     (NEW)
  scripts/verify-cancel-reason-required.mjs                                 (NEW CI guard)
  docs/specs/gap-10-cancel-reasons-catalog.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G37 master rule (Phase 3 deferred) · "Reason catalog required on every
        cancel" · Locked vocabulary needs slug-stable IDs

PROBLEM: Loads can be cancelled today without a reason recorded. No catalog 
exists. No /reports/load-cancellations dashboard. Audit trail loses 
business-cause information.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0300
  CREATE TABLE IF NOT EXISTS catalogs.cancel_reasons (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    requires_followup BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO catalogs.cancel_reasons (slug, label, requires_followup, sort_order) VALUES
    ('weather',              'Weather event',                 false, 10),
    ('customer-cancel',      'Customer cancelled',            false, 20),
    ('accident',             'Accident en route',             true,  30),
    ('driver-abandoned',     'Driver abandoned load',         true,  40),
    ('equipment',            'Equipment failure',             true,  50),
    ('rate-dispute',         'Rate dispute',                  false, 60),
    ('dispatcher-error',     'Dispatcher error',              true,  70),
    ('other',                'Other (notes required)',        true,  99)
  ON CONFLICT (slug) DO NOTHING;
  ALTER TABLE dispatch.loads
    ADD COLUMN IF NOT EXISTS cancel_reason_slug TEXT REFERENCES catalogs.cancel_reasons(slug),
    ADD COLUMN IF NOT EXISTS cancel_reason_notes TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_user_uuid UUID NULL;
  GRANT SELECT ON catalogs.cancel_reasons TO app_user;
  GRANT SELECT, UPDATE ON dispatch.loads TO app_user;

PIECE B — Backend service + routes
  cancel-load.service.ts EDIT:
    cancelLoad(load_uuid, {reason_slug, notes, user_uuid}) → 
      throw E_VALIDATION_CANCEL_REASON_REQUIRED if reason_slug NULL or invalid
      validate notes non-empty if requires_followup=true
      sets cancelled_at, cancelled_by_user_uuid, cancel_reason_slug, cancel_reason_notes
      emits audit_event with full context
  Routes:
    GET  /api/catalogs/cancel-reasons (list active reasons)
    PATCH /api/dispatch/loads/:uuid/cancel body: {reason_slug, notes}
    GET  /api/reports/load-cancellations?from=&to=&group_by=reason (NEW)

PIECE C — Frontend
  CancelLoadModal.tsx EDIT:
    Add required dropdown "Cancellation reason" populated from catalog.
    Add optional/required (per requires_followup) "Notes" textarea.
    Submit button disabled until reason selected (+ notes if required).
  LoadCancellationsReport.tsx NEW:
    Distribution chart by reason, count + total revenue cancelled per reason, 
    drill-down to specific cancelled loads.

PIECE D — CI guard
  verify-cancel-reason-required.mjs:
    Verify migration columns + table exist
    Verify routes registered
    Verify CancelLoadModal blocks submit without reason
    Wired into verify:arch-design

PIECE E — Tests
  cancel-reasons.test.ts: catalog read, cancel happy path, cancel without 
  reason → 422, cancel without notes when required → 422, audit event content.

PIECE F — Docs
  docs/specs/gap-10-cancel-reasons-catalog.md

ACCEPTANCE:
[ ] Migration 0300 applied + 8 reasons seeded
[ ] Cancel without reason → 422 error_code=E_VALIDATION_CANCEL_REASON_REQUIRED
[ ] Modal blocks submit until reason selected
[ ] Report renders distribution
[ ] verify-cancel-reason-required.mjs in CI chain
[ ] No regression — historical loads with NULL cancel_reason_slug remain valid

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any existing dispatch test fails on PATCH /cancel without reason, 
       STOP — verify backward compatibility intentional or refactor those tests.

POST-MERGE NEXT STEPS: Owner can use distribution data for operational 
review (driver retention, customer profitability — feeds GAP-74/GAP-76).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
