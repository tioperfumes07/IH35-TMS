═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-45 — /reports/cash-flow + /reports/per-truck-cpm Route Fix
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-U  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-44 (Lane A) — same wave G-U

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-44 owned):
  apps/backend/src/reports/form-425c/**
  apps/frontend/src/pages/reports/form-425c/**

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/reports/cash-flow/route-fix.ts                            (NEW)
  apps/backend/src/reports/per-truck-cpm/route.ts                            (NEW)
  apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts           (NEW)
  apps/backend/src/reports/per-truck-cpm/__tests__/                          (NEW dir)
  apps/frontend/src/pages/reports/CashFlowReport.tsx                         (EDIT — fix routing)
  apps/frontend/src/pages/reports/PerTruckCpmReport.tsx                      (NEW)
  scripts/verify-cash-flow-cpm-routes.mjs                                    (NEW CI guard)
  docs/specs/gap-45-cash-flow-cpm-routes.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: P6-C1 known-broken routes · /reports/cash-flow loads incorrect data, 
        /reports/per-truck-cpm doesn't exist · Block-14 Cash Flow shipped but 
        wired wrong

PROBLEM: 
  1. /reports/cash-flow → backend route returns 200 but with TRK-only data 
     even when TRANSP selected (operating_company_id not honored)
  2. /reports/per-truck-cpm → route doesn't exist (404) but listed in 
     Reports Hub
Owner can't view per-truck cost-per-mile, critical for driver retention + 
truck profitability decisions.

SCOPE — ADDITIVE ONLY:

PIECE A — Cash flow route fix
  route-fix.ts:
    Diagnose existing /api/reports/cash-flow handler
    Ensure operating_company_id param honored in WHERE clauses
    Existing Block-14 service untouched; this layer adds correct routing.

PIECE B — Per-truck CPM service
  cpm-calculator.service.ts:
    calculatePerTruckCpm(operating_company_id, from, to) →
      Per unit_uuid:
        Total miles driven in period (from dispatch.loads + GPS)
        Total cost:
          - Driver pay attributable (settlement allocation by unit)
          - Fuel cost (from fuel.transactions on this unit)
          - Maintenance cost (from accounting.bills tagged this unit)
          - Allocated insurance + permits (period-proportional)
        cpm = total_cost / total_miles
      Return [{unit_uuid, display_id, miles, total_cost, cpm}, ...] sorted

PIECE C — Per-truck CPM route
  route.ts:
    GET /api/reports/per-truck-cpm?from=&to=&operating_company_id=

PIECE D — Frontend pages
  CashFlowReport.tsx EDIT: ensure operating_company_id passed in query
  PerTruckCpmReport.tsx (new /reports/per-truck-cpm):
    Table: unit | miles | total cost | CPM | rank
    Filter: period + operating_company_id
    Highlights: outliers (CPM > 2× fleet median) in red

PIECE E — CI guard
  verify-cash-flow-cpm-routes.mjs:
    Cash flow route returns operating_company_id-correct data
    Per-truck CPM route exists + returns valid data
    Reports Hub catalog references both correctly

PIECE F — Tests
  cpm-calculator.test.ts: allocation math, edge cases (unit with 0 miles, 
    unit with no costs), RLS isolation.
  Cash flow regression test: per operating_company_id correctness.

PIECE G — Docs
  docs/specs/gap-45-cash-flow-cpm-routes.md (cite P6-C1, allocation methodology)

ACCEPTANCE:
[ ] /reports/cash-flow returns correct OCI data
[ ] /reports/per-truck-cpm exists + works
[ ] Allocation math reproducible
[ ] verify-cash-flow-cpm-routes.mjs in CI chain
[ ] No regression on Block-14 cash flow underlying service

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if cash flow OCI fix breaks other report routes, STOP — investigate 
       shared service dependency.

POST-MERGE NEXT STEPS: feeds GAP-75 per-load profitability (different lens 
       — load vs unit).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
