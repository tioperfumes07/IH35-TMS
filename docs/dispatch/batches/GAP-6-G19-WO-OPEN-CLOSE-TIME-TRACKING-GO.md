═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-6 — G19 WO Open/Close Time Tracking
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-B (post-CLOSURE-30 PASS-8 GO)  ·  LANE: B  ·  CURSOR-B
SEQUENCING: dispatch AFTER GAP queue unpauses
PAIRED WITH: GAP-4 (Lane A) — same wave G-B

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-4 owned):
  apps/backend/src/master-data/drivers/**
  apps/backend/src/master-data/units/**
  apps/frontend/src/pages/drivers/**
  apps/frontend/src/pages/assets/**
  migrations/0297_driver_asset_qbo_vendor_class.sql

ALLOWED FILES (disjoint from Lane A):
  migrations/0298_wo_time_tracking_columns.sql                              (NEW)
  apps/backend/src/maintenance/work-orders/wo-time-tracking.service.ts      (NEW)
  apps/backend/src/maintenance/work-orders/wo-time-tracking.routes.ts       (NEW)
  apps/backend/src/maintenance/work-orders/__tests__/time-tracking.test.ts  (NEW)
  apps/frontend/src/pages/maintenance/work-orders/WorkOrderList.tsx         (EDIT — add Avg Close KPI)
  apps/frontend/src/pages/maintenance/work-orders/WorkOrderDetail.tsx       (EDIT — show duration)
  apps/frontend/src/pages/maintenance/reports/WoCloseTimeAnalytics.tsx      (NEW)
  apps/backend/src/maintenance/reports/wo-close-time.routes.ts              (NEW)
  scripts/verify-wo-time-tracking-fields.mjs                                (NEW CI guard)
  docs/specs/gap-6-wo-time-tracking.md                                      (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G19 master rule — "Track WO opened_at, closed_at, duration to know how
        long repairs took" · UI-3 mockup shows Avg Close column in KPI row ·
        Reporting requirement per master rules

PROBLEM: maintenance.work_orders has created_at but no formal opened_at,
closed_at, or duration_minutes. KPI row in WorkOrderList currently shows
placeholder "Avg Close" without real computation. No per-driver/per-unit
analytics on repair turnaround.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0298
  ALTER TABLE maintenance.work_orders
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS duration_minutes INTEGER 
      GENERATED ALWAYS AS (
        CASE WHEN closed_at IS NOT NULL AND opened_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (closed_at - opened_at))/60 
        ELSE NULL END
      ) STORED;
  -- Backfill: opened_at = created_at for existing rows
  UPDATE maintenance.work_orders SET opened_at = created_at WHERE opened_at IS NULL;
  -- For status='completed' rows with completed_at, backfill closed_at
  UPDATE maintenance.work_orders SET closed_at = completed_at 
    WHERE status='completed' AND closed_at IS NULL AND completed_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_wo_duration ON maintenance.work_orders(duration_minutes) 
    WHERE duration_minutes IS NOT NULL;
  GRANT SELECT ON maintenance.work_orders TO app_user;

PIECE B — Backend service + routes
  wo-time-tracking.service.ts:
    - openWorkOrder(wo_uuid) → sets opened_at if NULL, audit event
    - closeWorkOrder(wo_uuid) → sets closed_at, audit event, recompute duration
    - getCloseTimeStats(date_range, group_by) → median, p90, count
  Routes:
    POST /api/maintenance/work-orders/:uuid/open
    POST /api/maintenance/work-orders/:uuid/close
    GET  /api/maintenance/reports/wo-close-time-stats?from=&to=&group_by=

PIECE C — Frontend
  WorkOrderList.tsx: KPI card "Avg Close: 3.2d (median) · 7.8d (p90)" pulls from new endpoint.
  WorkOrderDetail.tsx: shows "Open for: 3d 14h" or "Closed in: 5d 2h" badge.
  WoCloseTimeAnalytics.tsx: new /maintenance/reports/wo-close-time page with chart by driver, unit, WO type.

PIECE D — CI guard
  verify-wo-time-tracking-fields.mjs:
    - Verifies migration columns exist
    - Verifies routes registered
    - Verifies UI components consume new endpoint
    - Wired into verify:arch-design

PIECE E — Tests
  time-tracking.test.ts: open/close lifecycle, duration computation, stats grouping, RLS isolation.

PIECE F — Docs
  docs/specs/gap-6-wo-time-tracking.md

ACCEPTANCE:
[ ] Migration 0298 applied to prod
[ ] Backfill complete (no orphan rows)
[ ] All routes return correct data
[ ] Avg Close KPI shows real numbers
[ ] /maintenance/reports/wo-close-time analytics page renders
[ ] verify-wo-time-tracking-fields.mjs in CI chain
[ ] No regression

CI MUST PASS:
[ ] build:backend EMIT  
[ ] frontend tsc -b
[ ] verify:arch-design
[ ] vitest pass
[ ] block-ready.mjs EXIT=0

PAUSE: if backfill produces >0 rows with NULL opened_at after UPDATE, STOP 
       and report. Indicates rows with NULL created_at (data integrity issue).

POST-MERGE NEXT STEPS:
  - GAP-7 (Severe Repair/OOS) will surface duration in OOS estimate card

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
