═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-87 — Audit Log Universal Read-Only Viewer
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-S  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-88 (Lane B) — same wave P2-S

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-88 owned):
  apps/backend/src/data-export/full-tenant-export/**
  apps/frontend/src/pages/admin/data-export/**

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/audit/viewer/service.ts                                   (NEW)
  apps/backend/src/audit/viewer/routes.ts                                    (NEW)
  apps/backend/src/audit/viewer/__tests__/                                   (NEW)
  apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx                 (NEW)
  apps/frontend/src/components/audit/AuditEventCard.tsx                      (NEW)
  apps/frontend/src/components/admin/SuperAdminNav.tsx                       (EDIT — add link)
  scripts/verify-audit-log-viewer.mjs                                        (NEW CI guard)
  docs/specs/gap-87-audit-log-viewer.md                                      (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: All blocks emit audit_event rows · Need universal viewer for 
        compliance + forensics · Owner-only RBAC

PROBLEM: Audit events emit to audit_event table from every module but 
no UI exists to filter/search/view them. Forensic investigation requires 
SQL access.

SCOPE — ADDITIVE ONLY (read-only — never write):

PIECE A — Viewer service
  service.ts:
    queryAuditEvents({
      operating_company_id, entity_type, entity_uuid, user_uuid,
      action, from, to, severity, search_text, limit, offset
    }) → paginated events list
    getEventDetail(event_uuid) → full event with linked entities

PIECE B — Routes
  GET /api/audit/viewer/events?...filters
  GET /api/audit/viewer/events/:uuid
  All routes Owner-only RBAC (or future Super-Admin role).

PIECE C — Frontend
  AuditLogViewer.tsx (route /admin/audit-log):
    Filter panel: entity type, user, action, date range, search
    Paginated results table
    Click event → AuditEventCard with full detail
  AuditEventCard.tsx: shows before/after state, user, timestamp, evidence
  SuperAdminNav.tsx EDIT: add "Audit Log" link.

PIECE D — CI guard
  verify-audit-log-viewer.mjs: routes, RBAC, no-write paths.

PIECE E — Tests
  service.test.ts: filter combinations, pagination, RBAC enforcement, 
    read-only assertion.

PIECE F — Docs
  docs/specs/gap-87-audit-log-viewer.md

ACCEPTANCE:
[ ] Filter panel works for all dimensions
[ ] Pagination works (no full-table scan)
[ ] Owner-only enforced
[ ] Read-only confirmed (no write routes)
[ ] verify-audit-log-viewer.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if non-Owner can access, STOP — security regression.

POST-MERGE NEXT STEPS: future investigator role can view their assigned 
       scope; foundation for Phase 7 Compliance Center.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
