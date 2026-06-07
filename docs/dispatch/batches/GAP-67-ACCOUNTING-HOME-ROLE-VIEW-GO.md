═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-67 — Accounting Home Role-Specific View
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-I  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-68 (Lane B) — same wave P2-I

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-68 owned):
  apps/backend/src/safety-officer/role-views/**
  apps/frontend/src/pages/home/role-views/SafetyHome.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/accounting/role-home/accounting-home.service.ts           (NEW)
  apps/backend/src/accounting/role-home/routes.ts                            (NEW)
  apps/backend/src/accounting/role-home/__tests__/                           (NEW)
  apps/frontend/src/pages/home/role-views/AccountingHome.tsx                 (NEW)
  apps/frontend/src/components/home/AccountingKpiBar.tsx                     (NEW)
  apps/frontend/src/components/home/AccountingPendingApprovalsPanel.tsx      (NEW)
  apps/frontend/src/pages/home/Home.tsx                                      (EDIT — extend router)
  scripts/verify-accounting-home.mjs                                         (NEW CI guard)
  docs/specs/gap-67-accounting-home-view.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Same as GAP-66 (role-based home views) · Accounting role focus on 
        AR/AP/period close

PROBLEM: Accounting role sees generic home. They need: outstanding AR, 
overdue AP, period close progress, pending journal approvals, QBO sync 
queue depth.

SCOPE — ADDITIVE ONLY:

PIECE A — Service
  accounting-home.service.ts:
    getAccountingHomeData() →
      AR aging (current / 30 / 60 / 90+)
      AP aging (same buckets)
      Period close status (current period, days to close)
      Pending journal entry approvals
      QBO outbox depth + last sync time
      Early-pay discount opportunities expiring this week (GAP-37)

PIECE B — Routes
  GET /api/accounting/role-home

PIECE C — Frontend
  AccountingHome.tsx: 
    Top: AccountingKpiBar (AR total, AP total, period close countdown)
    Middle: aging bucket cards (AR + AP)
    Bottom: AccountingPendingApprovalsPanel
  Home.tsx EDIT: add accounting role branch.

PIECE D — CI guard
  verify-accounting-home.mjs: route registered, role branch added, 
    components render.

PIECE E — Tests
  accounting-home.test.ts: AR/AP aging calc, period status, RLS.

PIECE F — Docs
  docs/specs/gap-67-accounting-home-view.md

ACCEPTANCE:
[ ] Accounting role sees their view
[ ] AR/AP buckets render
[ ] Period close countdown accurate
[ ] verify-accounting-home.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if AR/AP totals don't match QBO mirror within $0.01, STOP — 
       financial integrity.

POST-MERGE NEXT STEPS: extends role home pattern.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
