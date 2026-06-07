═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-69 — Driver Manager Home Role-Specific View
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-J  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-70 (Lane B) — same wave P2-J

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-70 owned):
  apps/backend/src/integrations/edi/**
  apps/frontend/src/pages/integrations/edi/EdiSetupWizard.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/driver-manager/role-views/dm-home.service.ts              (NEW)
  apps/backend/src/driver-manager/role-views/routes.ts                       (NEW)
  apps/backend/src/driver-manager/role-views/__tests__/                      (NEW)
  apps/frontend/src/pages/home/role-views/DriverManagerHome.tsx              (NEW)
  apps/frontend/src/components/home/DriverManagerKpiBar.tsx                  (NEW)
  apps/frontend/src/components/home/DriverManagerAttentionPanel.tsx          (NEW)
  apps/frontend/src/pages/home/Home.tsx                                      (EDIT — extend router)
  scripts/verify-driver-manager-home.mjs                                     (NEW CI guard)
  docs/specs/gap-69-driver-manager-home-view.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Same as GAP-66/67/68 · Driver Manager role focuses on driver 
        retention, comms, payroll

PROBLEM: Driver Manager needs: pending driver communications, late 
arrivals this week, layovers needing per-diem decisions, pending 
settlements, expiring driver certs.

SCOPE — ADDITIVE ONLY:

PIECE A — Service
  dm-home.service.ts:
    getDriverManagerHomeData() →
      Unread driver comms (GAP-18) - inbound from drivers
      Late arrivals last 7d by driver (GAP-30)
      Pending layovers awaiting decision (GAP-28)
      Pending settlements (GAP-15 validation panel state)
      Drivers expired/expiring certs 30d
      Driver scoring weekly leaderboard top 3 + bottom 3 (GAP-60)
      Cooling drivers (no activity 14d+)

PIECE B — Routes
  GET /api/driver-manager/role-home

PIECE C — Frontend
  DriverManagerHome.tsx:
    Top: DriverManagerKpiBar (unread comms, late this week, pending settlements)
    Middle: DriverManagerAttentionPanel (sorted action list)
  Home.tsx EDIT: add driver_manager role branch.

PIECE D — CI guard
  verify-driver-manager-home.mjs: route + role branch + render OK.

PIECE E — Tests
  dm-home.test.ts: aggregation, scoping, RLS.

PIECE F — Docs
  docs/specs/gap-69-driver-manager-home-view.md

ACCEPTANCE:
[ ] Driver Manager sees their view
[ ] Unread comms count accurate
[ ] verify-driver-manager-home.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: graceful degradation if any source unavailable.

POST-MERGE NEXT STEPS: completes 5 role home views.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
