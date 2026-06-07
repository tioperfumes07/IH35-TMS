═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-68 — Safety Officer Home Role-Specific View
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-I  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-67 (Lane A) — same wave P2-I

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-67 owned):
  apps/backend/src/accounting/role-home/**
  apps/frontend/src/pages/home/role-views/AccountingHome.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/safety-officer/role-views/safety-home.service.ts          (NEW)
  apps/backend/src/safety-officer/role-views/routes.ts                       (NEW)
  apps/backend/src/safety-officer/role-views/__tests__/                      (NEW)
  apps/frontend/src/pages/home/role-views/SafetyHome.tsx                     (NEW)
  apps/frontend/src/components/home/SafetyKpiBar.tsx                         (NEW)
  apps/frontend/src/components/home/SafetyAlertsPanel.tsx                    (NEW)
  apps/frontend/src/pages/home/Home.tsx                                      (EDIT — extend router)
  scripts/verify-safety-officer-home.mjs                                     (NEW CI guard)
  docs/specs/gap-68-safety-officer-home-view.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Same as GAP-66/67 role-home pattern · Safety Officer focus

PROBLEM: Safety Officer role sees generic home. They need: open DVIR 
defects, HOS violations today, accidents this week, drug/alcohol test 
queue, CSA basic score updates, expiring certs (CDL/medical) 30-day window.

SCOPE — ADDITIVE ONLY:

PIECE A — Service
  safety-home.service.ts:
    getSafetyHomeData() →
      Open DVIR major defects count
      HOS violations today
      Open accidents (last 7d) + pending investigations
      D/A program (GAP-49?) random pool draws pending
      CSA basic scores last 30d
      Driver certs expiring 30d (CDL, medical, hazmat, TWIC)
      Worker comp open claims (GAP-9)

PIECE B — Routes
  GET /api/safety-officer/role-home

PIECE C — Frontend
  SafetyHome.tsx:
    Top: SafetyKpiBar (open defects, HOS violations today, expiring certs 30d)
    Middle: SafetyAlertsPanel (sorted by severity)
  Home.tsx EDIT: add safety_officer role branch.

PIECE D — CI guard
  verify-safety-officer-home.mjs: route registered, role branch, render OK.

PIECE E — Tests
  safety-home.test.ts: data aggregation, role scoping, RLS.

PIECE F — Docs
  docs/specs/gap-68-safety-officer-home-view.md

ACCEPTANCE:
[ ] Safety Officer sees their view
[ ] All KPI cards render
[ ] Alerts sorted by severity
[ ] verify-safety-officer-home.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if cert expiry data is stale (last sync >7d), STOP — driver files 
       sync needs verification.

POST-MERGE NEXT STEPS: completes 4 role home views (Owner, Dispatcher, 
       Accounting, Safety Officer).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
