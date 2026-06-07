═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-83 — ELD Audit Trail Read-Only Viewer
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-Q  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-84 (Lane B) — same wave P2-Q

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-84 owned):
  apps/backend/src/safety/inspection-history/**
  apps/frontend/src/pages/safety/inspection-history/**

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/safety/eld-audit-trail/viewer.service.ts                  (NEW)
  apps/backend/src/safety/eld-audit-trail/routes.ts                          (NEW)
  apps/backend/src/safety/eld-audit-trail/__tests__/                         (NEW)
  apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx                 (NEW)
  apps/frontend/src/components/safety/EldEditHistoryTimeline.tsx             (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                           (EDIT — add ELD tab)
  scripts/verify-eld-audit-trail.mjs                                         (NEW CI guard)
  docs/specs/gap-83-eld-audit-trail.md                                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: FMCSA ELD mandate · Driver/dispatcher edits to HOS logs must be 
        audit-trailed · Read-only viewer ensures integrity

PROBLEM: Samsara ELD allows edits (with reasons). Edit history pulled from 
Samsara API but never surfaced in TMS. Auditors / DOT inspectors need to 
see edit trail per driver per period.

SCOPE — ADDITIVE ONLY (read-only — never modify ELD data):

PIECE A — Viewer service
  viewer.service.ts:
    getEditHistory(driver_uuid, from, to) →
      Pulls from samsara.hos_log_edits mirror
      Returns chronological edit list with: edited_at, edited_by, 
      reason, before/after state per field

PIECE B — Routes
  GET /api/safety/eld/audit-trail?driver=&from=&to=
  GET /api/safety/eld/audit-trail/driver/:uuid/recent

PIECE C — Frontend
  EldAuditTrailViewer.tsx (route /safety/eld/audit-trail):
    Driver picker + date range
    Timeline view showing each edit
    Export to PDF for DOT submission
  EldEditHistoryTimeline.tsx: per-driver embed
  DriverDetail.tsx EDIT: add "ELD Edits" tab (10th tab — after Performance)

PIECE D — CI guard
  verify-eld-audit-trail.mjs: routes, viewer, tab render.

PIECE E — Tests
  viewer.test.ts: history retrieval, PDF export, RLS, READ-ONLY enforcement.

PIECE F — Docs
  docs/specs/gap-83-eld-audit-trail.md

ACCEPTANCE:
[ ] Edit history rendered chronologically
[ ] PDF export DOT-compliant
[ ] DriverDetail ELD Edits tab renders
[ ] verify-eld-audit-trail.mjs in CI chain
[ ] No write paths exposed (read-only confirmed)

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Samsara hos_log_edits mirror sparse (edits not synced), STOP and 
       verify Samsara sync includes edit history.

POST-MERGE NEXT STEPS: DOT inspector self-service portal (future Phase 7 
       Compliance Center).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
