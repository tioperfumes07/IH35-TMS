═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-74 — Customer Profitability Score Card
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-L  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-73 (Lane A) — same wave P2-L

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-73 owned):
  apps/backend/src/dispatch/loads/margin/**
  apps/frontend/src/components/dispatch/MarginPill.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/customers/profitability/aggregator.service.ts             (NEW)
  apps/backend/src/customers/profitability/routes.ts                         (NEW)
  apps/backend/src/customers/profitability/__tests__/                        (NEW)
  apps/backend/src/jobs/customer-profitability-worker.ts                     (NEW)
  apps/frontend/src/components/customers/ProfitabilityCard.tsx               (NEW)
  apps/frontend/src/pages/customers/CustomerDetail.tsx                       (EDIT — add card)
  apps/frontend/src/pages/reports/CustomerProfitabilityReport.tsx            (NEW)
  scripts/verify-customer-profitability.mjs                                  (NEW CI guard)
  docs/specs/gap-74-customer-profitability.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Consumer of GAP-73 margin data · Owner asks "which customers 
        actually make us money"

PROBLEM: Engagement (GAP-36) + Relationship (GAP-72) measure activity 
volume and health. Profitability measures dollars. Some volume customers 
have terrible margin. Owner can't tell which.

SCOPE — ADDITIVE ONLY (consumes GAP-73 margin snapshots):

PIECE A — Aggregator service
  aggregator.service.ts:
    computeCustomerProfitability(customer_uuid, period) →
      total_revenue, total_margin, avg_margin_per_load, 
      avg_margin_per_mile, load_count, miles_total
      profitability_rank_in_customer_set
    Pull from dispatch.load_margin_snapshots (GAP-73) JOIN customer.

PIECE B — Worker
  customer-profitability-worker.ts: runs daily.

PIECE C — Routes
  GET /api/customers/:uuid/profitability?period=30d
  GET /api/customers/profitability-leaderboard?period=&dimension=margin_pct

PIECE D — Frontend
  ProfitabilityCard.tsx: card showing total revenue, total margin, 
    margin %, rank vs other customers
  CustomerDetail.tsx EDIT: add card (Owner role only)
  CustomerProfitabilityReport.tsx (/reports/customer-profitability):
    Leaderboard table with sortable columns
    Highlight unprofitable customers (margin < 5%)

PIECE E — CI guard
  verify-customer-profitability.mjs: aggregator, worker, routes, UI, 
    RBAC (Owner-only display).

PIECE F — Tests
  aggregator.test.ts: per-customer computation, ranking logic, RLS.

PIECE G — Docs
  docs/specs/gap-74-customer-profitability.md

ACCEPTANCE:
[ ] Worker runs daily after GAP-73 worker
[ ] Profitability leaderboard renders
[ ] Per-customer card on CustomerDetail
[ ] Owner-only RBAC enforced
[ ] verify-customer-profitability.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if GAP-73 margin data not yet present, STOP — depends on GAP-73 
       worker running first.

POST-MERGE NEXT STEPS: Owner can re-negotiate rates with unprofitable 
       customers or fire them.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
