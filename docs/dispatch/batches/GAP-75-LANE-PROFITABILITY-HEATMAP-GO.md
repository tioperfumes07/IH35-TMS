═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-75 — Lane Profitability Heatmap
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-M  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-76 (Lane B) — same wave P2-M

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-76 owned):
  apps/backend/src/dispatch/deadhead/**
  apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/dispatch/analytics/lane-profitability/aggregator.service.ts (NEW)
  apps/backend/src/dispatch/analytics/lane-profitability/routes.ts          (NEW)
  apps/backend/src/dispatch/analytics/lane-profitability/__tests__/         (NEW)
  apps/backend/src/jobs/lane-profitability-worker.ts                        (NEW)
  apps/frontend/src/pages/reports/LaneProfitabilityHeatmap.tsx              (NEW)
  apps/frontend/src/components/reports/HeatmapMatrix.tsx                    (NEW)
  scripts/verify-lane-profitability-heatmap.mjs                             (NEW CI guard)
  docs/specs/gap-75-lane-profitability-heatmap.md                           (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Consumer of GAP-73 margin data · Lane = origin-state × dest-state 
        matrix · Visual heatmap for at-a-glance profit identification

PROBLEM: Operator/Owner needs to see WHICH state-to-state lanes are 
profitable. Hard to assess from tables. Visual heatmap (origin × dest 
matrix with color-coded cells) gives instant insight.

SCOPE — ADDITIVE ONLY:

PIECE A — Aggregator
  aggregator.service.ts:
    aggregateLaneProfitability(period) →
      For each origin_state × dest_state cell:
        total_loads, total_revenue, total_margin, avg_margin_pct, avg_rpm
      Returns matrix.

PIECE B — Worker
  lane-profitability-worker.ts: runs daily.

PIECE C — Routes
  GET /api/dispatch/analytics/lane-profitability?period=&min_loads=

PIECE D — Frontend
  LaneProfitabilityHeatmap.tsx (/reports/lane-profitability):
    Matrix view: rows = origin states, cols = dest states
    Cell color: green (high margin) → red (loss)
    Click cell → drill into loads in that lane
  HeatmapMatrix.tsx: reusable visualization component

PIECE E — CI guard
  verify-lane-profitability-heatmap.mjs: aggregator, worker, routes, UI.

PIECE F — Tests
  aggregator.test.ts: matrix calc, edge cases (low-volume cells), RLS.

PIECE G — Docs
  docs/specs/gap-75-lane-profitability-heatmap.md

ACCEPTANCE:
[ ] Worker runs daily
[ ] Heatmap renders state matrix
[ ] Click drills into lane detail
[ ] verify-lane-profitability-heatmap.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if heatmap render performance >500ms for full US matrix (51x51), 
       STOP and add server-side pre-aggregation.

POST-MERGE NEXT STEPS: feeds rate-quote tool + dispatch planning.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
