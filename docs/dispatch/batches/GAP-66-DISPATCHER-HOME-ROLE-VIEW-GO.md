═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-66 — Dispatcher Home Role-Specific View
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-H  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-65 (Lane A) — same wave P2-H

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-65 owned):
  apps/backend/src/owner/todays-attention/**
  apps/frontend/src/pages/home/OwnerHome.tsx
  apps/frontend/src/components/home/TodaysAttentionTop5.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts         (NEW)
  apps/backend/src/dispatcher-board/role-views/routes.ts                     (NEW)
  apps/backend/src/dispatcher-board/role-views/__tests__/                    (NEW)
  apps/frontend/src/pages/home/role-views/DispatcherHome.tsx                 (NEW)
  apps/frontend/src/components/home/DispatcherKpiBar.tsx                     (NEW)
  apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx           (NEW)
  apps/frontend/src/components/home/DispatcherPendingActionsPanel.tsx        (NEW)
  apps/frontend/src/pages/home/Home.tsx                                      (EDIT — role router)
  scripts/verify-dispatcher-home.mjs                                         (NEW CI guard)
  docs/specs/gap-66-dispatcher-home-view.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge directive · Each role should see role-relevant home view ·
        Dispatcher home = active loads, pending detention approvals, 
        booking gap analytics

PROBLEM: All users see same generic /home page. Dispatcher needs focused
view of their queue: active loads they own, pending booking decisions, 
incoming brokers, detention awaiting approval. Owner-relevant cards 
(Today's Attention) clutter their view.

SCOPE — ADDITIVE ONLY:

PIECE A — Dispatcher service
  dispatcher.service.ts:
    getDispatcherHomeData(user_uuid) →
      Active loads booked by this dispatcher
      Pending detention approvals assigned to this dispatcher
      Booking gap stats (this dispatcher's last 7d)
      Today's pickups + deliveries on their loads
      Incoming customer messages (GAP-18 inbound)

PIECE B — Routes
  GET /api/dispatcher-board/home (current user context)

PIECE C — Frontend
  DispatcherHome.tsx (route /home renders this when role=dispatcher):
    Top: DispatcherKpiBar (active count, late count, today pickups, today deliveries)
    Middle: DispatcherActiveLoadsPanel (compact load list w/ tri-signal)
    Bottom: DispatcherPendingActionsPanel (detention approvals, message queue)
  Home.tsx EDIT: role-based render router:
    if (user.role === 'owner') → OwnerHome
    else if (user.role === 'dispatcher') → DispatcherHome
    else if (user.role === 'maintenance') → MaintenanceHome (existing)
    else → DefaultHome (existing fallback)

PIECE D — CI guard
  verify-dispatcher-home.mjs: route registered, components render, 
    role-based routing in Home.tsx.

PIECE E — Tests
  dispatcher.test.ts: data scoping (dispatcher only sees own loads), 
    role-based access, RLS.

PIECE F — Docs
  docs/specs/gap-66-dispatcher-home-view.md

ACCEPTANCE:
[ ] Dispatcher logs in → sees dispatcher view
[ ] Owner logs in → sees owner view (unchanged)
[ ] Maintenance logs in → sees maintenance view (unchanged)
[ ] Data correctly scoped
[ ] verify-dispatcher-home.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if role router breaks default fallback (users with no role see 404), 
       STOP — graceful default required.

POST-MERGE NEXT STEPS: pattern extends to additional role views 
       (Accounting, Safety, Driver Manager, etc.) — separate blocks.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
