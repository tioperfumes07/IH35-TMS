═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-29 — Booking-Gap Time per Dispatcher Analytics
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-M  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-28 (Lane A) — same wave G-M

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-28 owned):
  apps/backend/src/dispatch/layovers/**
  apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx
  apps/frontend/src/pages/drivers/DriverDetail.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/dispatch/analytics/booking-gap.service.ts                 (NEW)
  apps/backend/src/dispatch/analytics/booking-gap.routes.ts                  (NEW)
  apps/backend/src/dispatch/analytics/__tests__/booking-gap.test.ts          (NEW)
  apps/backend/src/jobs/booking-gap-aggregator-worker.ts                     (NEW)
  apps/frontend/src/pages/reports/BookingGapReport.tsx                       (NEW)
  apps/frontend/src/components/dispatchers/DispatcherPerformanceCard.tsx     (NEW)
  scripts/verify-booking-gap-analytics.mjs                                   (NEW CI guard)
  docs/specs/gap-29-booking-gap-analytics.md                                 (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Dispatcher performance metric · Owner 
        wants to see which dispatchers maximize asset utilization

PROBLEM: Some dispatchers leave trucks idle between loads (slow re-booking)
while others have trucks rolling again within 2h. No analytics today → 
Owner can't reward/coach dispatchers based on objective data.

SCOPE — ADDITIVE ONLY:

PIECE A — Aggregator service
  booking-gap.service.ts:
    aggregateForPeriod(from, to) →
      For each dispatcher:
        For each load they booked:
          Compute gap = (this_load.assignment_at - prior_load_for_same_unit.delivery_at)
          Filter out >24h gaps (excludes legit downtime/weekends)
        Compute avg, p50, p90 per dispatcher
      Returns ranked dispatcher performance.

PIECE B — Worker
  booking-gap-aggregator-worker.ts: runs every 6h.

PIECE C — Routes
  GET /api/dispatch/analytics/booking-gap?from=&to=
  GET /api/dispatch/analytics/booking-gap/dispatcher/:user_uuid

PIECE D — Frontend
  BookingGapReport.tsx (route /reports/booking-gap):
    Leaderboard table: dispatcher | loads booked | avg gap | p50 | p90 | rank
    Filter: period (week / month / quarter)
    Highlights: best (green) and worst (amber) — not red (avoid public shame)
  DispatcherPerformanceCard.tsx: per-dispatcher card on user profile.

PIECE E — CI guard
  verify-booking-gap-analytics.mjs: routes registered, worker scheduled, 
    report renders.

PIECE F — Tests
  booking-gap.test.ts: gap computation, ranking, period filter, RLS.

PIECE G — Docs
  docs/specs/gap-29-booking-gap-analytics.md

ACCEPTANCE:
[ ] Worker runs every 6h
[ ] Report renders ranking
[ ] Per-dispatcher card on profile
[ ] verify-booking-gap-analytics.mjs in CI chain
[ ] No regression

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if dispatcher attribution unclear (anonymous bookings), STOP — 
       data quality on booked_by_user_uuid needs verification.

POST-MERGE NEXT STEPS: Owner can use for bonus / performance review; 
       no automated punitive action.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
