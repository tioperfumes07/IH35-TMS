═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-30 — Late-Arrival Rate per Driver/Customer
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-N  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-31 (Lane B) — same wave G-N

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-31 owned):
  apps/backend/src/dispatch/loads/multi-stop/**
  apps/frontend/src/components/dispatch/MultiStopExtraRateEditor.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/dispatch/analytics/late-arrival.service.ts                (NEW)
  apps/backend/src/dispatch/analytics/late-arrival.routes.ts                 (NEW)
  apps/backend/src/dispatch/analytics/__tests__/late-arrival.test.ts         (NEW)
  apps/backend/src/jobs/late-arrival-aggregator-worker.ts                    (NEW)
  apps/frontend/src/pages/reports/LateArrivalReport.tsx                      (NEW)
  apps/frontend/src/components/drivers/DriverLateArrivalCard.tsx             (NEW)
  apps/frontend/src/components/customers/CustomerLateArrivalCard.tsx         (NEW)
  scripts/verify-late-arrival-analytics.mjs                                  (NEW CI guard)
  docs/specs/gap-30-late-arrival-analytics.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · KPI for safety + customer ops · Late 
        arrivals damage customer relationships + CSA scores

PROBLEM: No metric tracks per-driver or per-customer late-arrival rate. 
Patterns invisible: 
  - Specific drivers chronically late
  - Specific customers' stops always run late (planning issue, not driver)
  - Specific lanes/times systematically problematic

SCOPE — ADDITIVE ONLY:

PIECE A — Aggregator service
  late-arrival.service.ts:
    aggregateLateArrivals(from, to) →
      For each completed stop:
        late = arrived_at > scheduled_at + 30min tolerance
      Group by driver, by customer, by lane
      Compute rate = late_count / total_count

PIECE B — Worker
  late-arrival-aggregator-worker.ts: runs every 6h.

PIECE C — Routes
  GET /api/dispatch/analytics/late-arrivals?by=driver|customer|lane&from=&to=
  GET /api/dispatch/analytics/late-arrivals/driver/:uuid
  GET /api/dispatch/analytics/late-arrivals/customer/:uuid

PIECE D — Frontend
  LateArrivalReport.tsx (route /reports/late-arrival):
    Tabs: By driver / By customer / By lane
    Highlights chronic offenders (>20% late rate)
  DriverLateArrivalCard.tsx: on DriverDetail
  CustomerLateArrivalCard.tsx: on CustomerDetail

PIECE E — CI guard
  verify-late-arrival-analytics.mjs: worker + routes + UI registered.

PIECE F — Tests
  late-arrival.test.ts: rate calc, grouping, RLS, threshold tuning.

PIECE G — Docs
  docs/specs/gap-30-late-arrival-analytics.md

ACCEPTANCE:
[ ] Worker runs every 6h
[ ] 3 grouping dimensions work (driver/customer/lane)
[ ] Per-entity cards render
[ ] verify-late-arrival-analytics.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if scheduled_at NULL on >10% of stops (data quality), STOP — 
       can't compute late without scheduled time.

POST-MERGE NEXT STEPS: feeds Safety > Driver Files for driver scoring; 
       feeds Customer Detail for relationship visibility.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
