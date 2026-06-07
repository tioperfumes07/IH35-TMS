═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-35 — G23 Driver PWA True-Status Page (delivered → invoiced → factored)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-P  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-34 (Lane A) — same wave G-P

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-34 owned):
  apps/driver-pwa/src/screens/DispatchView.tsx
  apps/driver-pwa/src/components/dispatch/**
  apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts

ALLOWED FILES (disjoint from Lane A):
  apps/driver-pwa/src/screens/LoadTrueStatus.tsx                              (NEW)
  apps/driver-pwa/src/components/load/StatusTimeline.tsx                      (NEW)
  apps/driver-pwa/src/components/load/PaymentEstimateCard.tsx                 (NEW)
  apps/backend/src/dispatch/loads/true-status/timeline.service.ts             (NEW)
  apps/backend/src/dispatch/loads/true-status/timeline.routes.ts              (NEW)
  apps/backend/src/dispatch/loads/true-status/__tests__/timeline.test.ts      (NEW)
  scripts/verify-driver-pwa-true-status.mjs                                   (NEW CI guard)
  docs/specs/gap-35-driver-pwa-true-status.md                                 (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G23 master rule · Drivers want to see "real" status of their loads — 
        not just dispatch state but financial state (invoiced, factored, paid) · 
        Trust + transparency driver retention

PROBLEM: Driver PWA shows load as "delivered" but driver doesn't know:
  - Has the load been invoiced to the customer?
  - Has the factor advanced on it?
  - Has the customer paid?
  - What's the expected settlement date?
Driver asks dispatcher → dispatcher pulls from accounting → wastes time both sides.

SCOPE — ADDITIVE ONLY (READ-ONLY for driver — no money flow exposed):

PIECE A — Timeline service
  timeline.service.ts:
    getLoadTimeline(load_uuid, driver_uuid) →
      Cross-references dispatch.loads, accounting.invoices, factor.advances, 
      accounting.payments, accounting.settlements
      Returns ordered events:
        [
          {at, kind: 'dispatched',   detail: 'Load assigned'},
          {at, kind: 'in_transit',   detail: 'Picked up at LAX'},
          {at, kind: 'delivered',    detail: 'Delivered to MIA'},
          {at, kind: 'invoiced',     detail: 'Invoice INV-X sent'},
          {at, kind: 'factored',     detail: 'Factor advanced $X.XX'},
          {at, kind: 'customer_paid',detail: 'Customer paid factor'},
          {at, kind: 'settlement',   detail: 'In settlement #SET-Y'},
        ]
      RLS: driver only sees their own loads, only sanitized $ (no margin).
      Sanitize: show GROSS rate to driver but NOT factor fee or margin.

PIECE B — Route
  GET /api/dispatch/driver-pwa/load/:uuid/true-status-timeline

PIECE C — Frontend
  LoadTrueStatus.tsx (PWA screen, accessible from Loads list):
    Vertical timeline UI rendering above 7 event kinds with icons + dates
    StatusTimeline.tsx component (reusable)
    PaymentEstimateCard.tsx: shows "Expected in next settlement: $X.XX" 
      when settlement_estimated_at populated

PIECE D — CI guard
  verify-driver-pwa-true-status.mjs: route registered, screen exists, 
    PWA route resolves, sanitization tests in place.

PIECE E — Tests
  timeline.test.ts: per-stage detection, RLS isolation, $ sanitization, 
    multi-load aggregation.

PIECE F — Docs
  docs/specs/gap-35-driver-pwa-true-status.md (cite G23 — explicit which $ 
  values are/aren't shown to driver)

ACCEPTANCE:
[ ] Timeline service returns correct events
[ ] PWA renders ordered timeline
[ ] PaymentEstimateCard shows expected settlement value
[ ] Driver CANNOT see factor fee or margin (sanitization enforced)
[ ] RLS prevents cross-driver visibility
[ ] verify-driver-pwa-true-status.mjs in CI chain

CI MUST PASS: build:backend EMIT · driver-pwa tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if sanitization test fails (driver could see margin/factor fee), STOP — 
       sensitive financial leakage cannot ship.

POST-MERGE NEXT STEPS: integrates with driver earnings screen (G23) for 
       per-load earning lineage.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
