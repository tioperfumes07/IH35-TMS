═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-24 — Per-Screen Samsara Freshness Budget
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-K  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP-23 ships (depends on tier infrastructure)
PAIRED WITH: GAP-25 (Lane B) — same wave G-K

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-25 owned):
  apps/backend/src/integrations/samsara/active-driver-set/**
  apps/backend/src/jobs/active-driver-set-recompute.ts

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/integrations/samsara/freshness-budget.config.ts           (NEW)
  apps/backend/src/integrations/samsara/freshness-budget.service.ts          (NEW)
  apps/backend/src/integrations/samsara/freshness-budget.routes.ts           (NEW)
  apps/backend/src/integrations/samsara/__tests__/freshness.test.ts          (NEW)
  apps/frontend/src/lib/freshness-indicator.ts                               (NEW)
  apps/frontend/src/components/shared/FreshnessIndicator.tsx                 (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                         (EDIT — wire indicator)
  apps/frontend/src/pages/dispatch/MapView.tsx                               (EDIT — wire indicator)
  apps/frontend/src/pages/safety/hos/HosClocksTab.tsx                        (EDIT — wire indicator)
  scripts/verify-freshness-budget-applied.mjs                                (NEW CI guard)
  docs/specs/gap-24-freshness-budget.md                                      (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Locked freshness budget per screen prevents
        ambiguity about cache tier choice · Operator visibility into data 
        recency required

PROBLEM: Operators see Samsara data without knowing how fresh it is. 
"Truck at 31.5°N, -97.3°W" could be 5 seconds old or 5 minutes old. 
Decision-making suffers without visible freshness signal. Each consumer 
component picks its own tier ad-hoc → inconsistent budgets.

SCOPE — ADDITIVE ONLY:

PIECE A — Freshness budget config (LOCKED)
  freshness-budget.config.ts:
    export const FRESHNESS_BUDGETS = {
      'dispatch-board.gps':         { tier: 2, max_age_ms: 30_000 },
      'dispatch-board.eta':         { tier: 2, max_age_ms: 30_000 },
      'dispatch-board.tri-signal':  { tier: 3, max_age_ms: 60_000 },
      'map-view.positions':         { tier: 2, max_age_ms: 30_000 },
      'hos.clocks':                 { tier: 1, max_age_ms: 5_000 },
      'hos.violations':             { tier: 3, max_age_ms: 300_000 },
      'driver-scoring.composite':   { tier: 4, max_age_ms: 900_000 },
      'driver-pwa.my-position':     { tier: 1, max_age_ms: 5_000 },
      'driver-pwa.eta-checkin':     { tier: 2, max_age_ms: 30_000 },
      'maintenance.arriving-soon':  { tier: 3, max_age_ms: 300_000 },
      'fuel-planner.hos-leg':       { tier: 3, max_age_ms: 300_000 },
      'safety.driver-scoring':      { tier: 4, max_age_ms: 900_000 },
      'integrity-report.drift':     { tier: 4, max_age_ms: 900_000 },
    } as const;

PIECE B — Service
  freshness-budget.service.ts:
    getDataWithFreshness(screen_id, query) → {data, freshness_ms, tier}
    Uses GAP-23 cache tiers based on budget assignment.

PIECE C — Routes
  GET /api/integrations/samsara/freshness/:screen_id

PIECE D — Frontend indicator
  FreshnessIndicator.tsx: small badge component showing "Updated 12s ago" 
    in green / amber (>budget) / red (>2× budget).
  freshness-indicator.ts: helper to compute color per budget threshold.

PIECE E — Wire into 3 consumers
  DispatchBoard.tsx EDIT: FreshnessIndicator at top of GPS column
  MapView.tsx EDIT: FreshnessIndicator above map
  HosClocksTab.tsx EDIT: FreshnessIndicator above clocks table

PIECE F — CI guard
  verify-freshness-budget-applied.mjs:
    Every screen_id in FRESHNESS_BUDGETS has corresponding consumer using it.
    Every Samsara consumer specifies a screen_id (no implicit tier).
    Wired into verify:arch-design.

PIECE G — Tests
  freshness.test.ts: budget enforcement, color thresholds, tier wiring.

PIECE H — Docs
  docs/specs/gap-24-freshness-budget.md

ACCEPTANCE:
[ ] All 13 budgets locked in config
[ ] FreshnessIndicator renders in 3 wired consumers
[ ] Service returns data + freshness metadata
[ ] CI guard enforces budget coverage
[ ] No regression

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any locked budget produces freshness>>2x budget consistently, 
       STOP — tier assignment needs adjustment.

POST-MERGE NEXT STEPS: Future Samsara features must register in budget 
       config or CI fails.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
