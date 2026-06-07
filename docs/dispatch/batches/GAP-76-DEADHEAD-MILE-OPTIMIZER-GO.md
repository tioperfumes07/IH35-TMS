═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-76 — Deadhead Mile Optimizer
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-M  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-75 (Lane A) — same wave P2-M

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-75 owned):
  apps/backend/src/dispatch/analytics/lane-profitability/**
  apps/frontend/src/pages/reports/LaneProfitabilityHeatmap.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/dispatch/deadhead/optimizer.service.ts                    (NEW)
  apps/backend/src/dispatch/deadhead/routes.ts                               (NEW)
  apps/backend/src/dispatch/deadhead/__tests__/                              (NEW)
  apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx           (NEW)
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx                    (EDIT — embed panel)
  scripts/verify-deadhead-optimizer.mjs                                      (NEW CI guard)
  docs/specs/gap-76-deadhead-optimizer.md                                    (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Empty mile reduction = direct profit · 
        Industry avg deadhead 15-20%; reducing 1% = ~$50K annual savings 
        on fleet

PROBLEM: Drivers complete delivery in city A, next load assigned in city B 
500mi away. No suggestion of alternative load options that minimize 
deadhead. Dispatchers optimize manually if at all.

SCOPE — ADDITIVE ONLY:

PIECE A — Optimizer service
  optimizer.service.ts:
    findBestLoadForUnit(unit_uuid, after_delivery_at, max_deadhead_miles=200) →
      Returns ranked list of pending loads near drop:
        [{load_uuid, deadhead_miles, est_revenue, est_margin, score}]
      Score = (revenue - deadhead_cost) / total_miles

PIECE B — Routes
  GET /api/dispatch/deadhead/next-load-suggestions?unit=&after=

PIECE C — Frontend
  DeadheadOptimizerPanel.tsx: panel showing top 5 suggestions
  BookLoad.tsx EDIT: when assigning unit, show this panel with 
    suggestions for "next load after this one ends".

PIECE D — CI guard
  verify-deadhead-optimizer.mjs: routes, panel render.

PIECE E — Tests
  optimizer.test.ts: ranking accuracy, distance calc, edge cases (no 
    nearby loads), RLS.

PIECE F — Docs
  docs/specs/gap-76-deadhead-optimizer.md

ACCEPTANCE:
[ ] Suggestions ranked correctly
[ ] Panel in BookLoad
[ ] Within max_deadhead constraint
[ ] verify-deadhead-optimizer.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if distance API rate-limited (Google distance matrix), STOP and 
       add cache layer first.

POST-MERGE NEXT STEPS: dispatcher KPI (GAP-29) can credit dispatchers 
       who consistently use optimizer suggestions.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
