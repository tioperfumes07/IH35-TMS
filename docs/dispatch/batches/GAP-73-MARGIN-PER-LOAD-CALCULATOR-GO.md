═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-73 — Margin per Load Calculator + Display
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-L  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-74 (Lane B) — same wave P2-L

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-74 owned):
  apps/backend/src/customers/profitability/**
  apps/frontend/src/components/customers/ProfitabilityCard.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/dispatch/loads/margin/calculator.service.ts               (NEW)
  apps/backend/src/dispatch/loads/margin/routes.ts                           (NEW)
  apps/backend/src/dispatch/loads/margin/__tests__/                          (NEW)
  apps/backend/src/jobs/margin-calculator-worker.ts                          (NEW)
  apps/frontend/src/components/dispatch/MarginPill.tsx                       (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                         (EDIT — add column)
  apps/frontend/src/pages/dispatch/loads/LoadDetail.tsx                      (EDIT — add breakdown)
  migrations/0324_load_margin_snapshots.sql                                  (NEW)
  scripts/verify-margin-calculator.mjs                                       (NEW CI guard)
  docs/specs/gap-73-margin-per-load.md                                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Per-load profitability invisible · 
        Owner can't identify unprofitable lanes/customers without 
        per-load margin

PROBLEM: TMS knows revenue per load but doesn't compute true cost: fuel, 
driver pay (settlement), tolls, layover, detention, fixed cost allocation. 
Margin per load not visible. Operators chase volume not profit.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0324
  CREATE TABLE IF NOT EXISTS dispatch.load_margin_snapshots (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    load_uuid UUID NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revenue_total NUMERIC(12,2) NOT NULL,
    cost_fuel NUMERIC(10,2) NOT NULL,
    cost_driver_pay NUMERIC(10,2) NOT NULL,
    cost_tolls NUMERIC(10,2) NOT NULL DEFAULT 0,
    cost_detention NUMERIC(10,2) NOT NULL DEFAULT 0,
    cost_layover NUMERIC(10,2) NOT NULL DEFAULT 0,
    cost_other NUMERIC(10,2) NOT NULL DEFAULT 0,
    cost_fixed_alloc NUMERIC(10,2) NOT NULL DEFAULT 0,  -- per-mile fixed cost allocation
    margin_total NUMERIC(12,2) GENERATED ALWAYS AS (
      revenue_total - cost_fuel - cost_driver_pay - cost_tolls 
      - cost_detention - cost_layover - cost_other - cost_fixed_alloc
    ) STORED,
    margin_pct NUMERIC(6,3),
    miles NUMERIC(8,2),
    margin_per_mile NUMERIC(8,3) GENERATED ALWAYS AS (
      CASE WHEN miles > 0 THEN margin_total / miles ELSE NULL END
    ) STORED
  );
  CREATE INDEX idx_margin_load ON dispatch.load_margin_snapshots(load_uuid, computed_at DESC);
  GRANT SELECT, INSERT ON dispatch.load_margin_snapshots TO app_user;

PIECE B — Calculator
  calculator.service.ts:
    computeMargin(load_uuid) →
      Pulls: invoices, fuel.transactions tied to load, driver settlement portion, 
             dispatch.detention_requests, dispatch.driver_layovers, 
             extra_rates from invoices
      Computes fixed_cost_allocation = miles * fleet_fixed_cpm constant
      Returns snapshot

PIECE C — Worker
  margin-calculator-worker.ts: runs hourly on completed loads with invoices.

PIECE D — Routes
  GET /api/dispatch/loads/:uuid/margin
  GET /api/dispatch/loads/margin-summary?from=&to=&group_by=customer|lane|driver

PIECE E — Frontend
  MarginPill.tsx: green/amber/red pill on dispatch board column
  DispatchBoard.tsx EDIT: add "Margin" column (Owner role only display)
  LoadDetail.tsx EDIT: margin breakdown card (Owner role only)

PIECE F — CI guard
  verify-margin-calculator.mjs: migration, worker, routes, UI, RBAC 
    (Owner-only display).

PIECE G — Tests
  calculator.test.ts: end-to-end margin calc, edge cases (no invoice, no 
    fuel data), RLS, Owner-only enforcement.

PIECE H — Docs
  docs/specs/gap-73-margin-per-load.md (cite fixed_cpm constant source)

ACCEPTANCE:
[ ] Migration 0324 applied
[ ] Worker runs hourly
[ ] Margin computed correctly on test loads
[ ] Dispatch board shows margin pill (Owner only)
[ ] Load detail shows breakdown (Owner only)
[ ] verify-margin-calculator.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if fixed_cpm constant undefined or unrealistic, STOP — needs Jorge 
       sign-off on fixed-cost allocation method.

POST-MERGE NEXT STEPS: feeds GAP-74 customer profitability + GAP-65 Owner 
       Today's Attention (top unprofitable lanes).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
