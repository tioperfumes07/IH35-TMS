═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-17 — Maintenance "Arriving Soon Needs Service" Priority Queue
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-G  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-16 (Lane A) — same wave G-G

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-16 owned):
  apps/backend/src/accounting/validation/**
  apps/frontend/src/components/accounting/PreAccountingValidationPanel.tsx
  apps/frontend/src/pages/accounting/**

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/maintenance/arriving-soon/queue.service.ts                (NEW)
  apps/backend/src/maintenance/arriving-soon/queue.routes.ts                 (NEW)
  apps/backend/src/maintenance/arriving-soon/__tests__/queue.test.ts         (NEW)
  apps/backend/src/jobs/arriving-soon-aggregator.ts                          (NEW worker)
  apps/frontend/src/pages/maintenance/home/MaintenanceHome.tsx               (EDIT — add card)
  apps/frontend/src/pages/maintenance/home/ArrivingSoonQueue.tsx             (NEW)
  apps/frontend/src/pages/home/MaintenanceArrivingSoonCard.tsx               (NEW)
  apps/frontend/src/pages/home/Home.tsx                                      (EDIT — add card)
  scripts/verify-arriving-soon-queue.mjs                                     (NEW CI guard)
  docs/specs/gap-17-arriving-soon-queue.md                                   (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: UA §6 unified blueprint addition (locked 2026-05-06) · "Maintenance
        — Arriving Soon Needs Service priority queue" · proactive maintenance
        per Jorge directive · NOT YET SHIPPED

PROBLEM: Maintenance home page shows "Open WOs", "Past Due", "Tire Alerts"
but has NO queue showing "trucks arriving within X hours that need PM/
service NOW so we can pre-stage parts + dock". Operators discover service
needs only when truck arrives, losing prep time.

SCOPE — ADDITIVE ONLY:

PIECE A — Queue service
  queue.service.ts:
    computeArrivingSoonQueue() →
      For each dispatch.loads WHERE status='in_transit':
        Compute ETA-to-yard (return location after delivery)
        Cross-reference unit_uuid with:
          - PM due dates (mileage + days)
          - Open WO list (any open service needs)
          - Severe/OOS flagged units
          - Tire alerts
          - DVIR major defects unresolved
        Compute priority score (severity × proximity)
        Returns sorted queue [{unit_uuid, eta_yard, services_needed, 
                              priority_score, parts_needed_skus}]

PIECE B — Routes
  GET /api/maintenance/arriving-soon/queue
  GET /api/maintenance/arriving-soon/unit/:uuid/services-needed

PIECE C — Background aggregator
  arriving-soon-aggregator.ts: runs every 15min, persists snapshot to 
    maintenance.arriving_soon_snapshot table (exists per Phase 2 maint v1).

PIECE D — Frontend queue page
  ArrivingSoonQueue.tsx (new tab in Maintenance Home):
    Table: Unit | ETA yard | Services needed | Parts needed | Priority pill
    Action: "Stage parts" button → pre-creates Material Request
    Color-code: red (severe), amber (PM overdue), green (routine PM)

PIECE E — Home cards
  MaintenanceArrivingSoonCard.tsx: shows top 5 arriving in next 8h with 
    severity counts. Surfaces in Maintenance home + Owner home.

PIECE F — CI guard
  verify-arriving-soon-queue.mjs: worker registered, routes registered, 
    queue page renders, home cards render.

PIECE G — Tests
  queue.test.ts: priority computation, ETA accuracy, parts-needed lookup, 
    RLS isolation.

PIECE H — Docs
  docs/specs/gap-17-arriving-soon-queue.md (cite UA §6)

ACCEPTANCE:
[ ] Aggregator runs every 15min
[ ] Queue page renders sorted by priority
[ ] Home card shows top 5 arrivals
[ ] "Stage parts" pre-creates Material Request
[ ] verify-arriving-soon-queue.mjs in CI chain
[ ] No regression on existing maintenance home

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if ETA accuracy <80% on test data (vs actual arrivals), STOP — 
       feeds priority calc, must be reliable.

POST-MERGE NEXT STEPS: parts inventory consumption (GAP-58 engine fault
       auto-WO) integrates here for severe-fault pre-staging.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
