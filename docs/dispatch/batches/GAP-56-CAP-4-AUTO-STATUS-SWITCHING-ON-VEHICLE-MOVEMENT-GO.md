═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-56 — CAP-4 Auto-Status Switching on Vehicle Movement
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-C  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-55 (Lane A) — same wave P2-C

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-55 owned):
  apps/backend/src/integrations/samsara/positions/**
  apps/backend/src/jobs/samsara-position-poll-worker.ts
  apps/frontend/src/pages/dispatch/MapView.tsx
  apps/driver-pwa/src/screens/MyPosition.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts (NEW)
  apps/backend/src/integrations/samsara/auto-status-switch/routes.ts        (NEW)
  apps/backend/src/integrations/samsara/auto-status-switch/__tests__/       (NEW)
  apps/backend/src/jobs/auto-status-switch-worker.ts                        (NEW)
  apps/frontend/src/components/dispatch/AutoStatusSwitchedBadge.tsx         (NEW)
  apps/driver-pwa/src/screens/AutoStatusNotice.tsx                          (NEW)
  scripts/verify-cap-4-auto-status-switch.mjs                               (NEW CI guard)
  docs/specs/gap-56-cap-4-auto-status-switch.md                             (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-4 from Samsara Capabilities · "GPS movement + no driver 
        confirmation = auto status change" · NOT BUILT

PROBLEM: When vehicle GPS shows movement but driver status is stale (e.g., 
still 'at_pickup' after departing), no auto-correction happens. Dispatch 
board shows wrong status. Conversely, if driver claims in_transit but truck 
hasn't moved, no flag.

SCOPE — ADDITIVE ONLY:

PIECE A — Detector service
  detector.service.ts:
    detectStatusDrift(load_uuid) →
      Compare driver-reported status vs GPS movement signal.
      Cases:
        A: GPS moved >5mi in last 30min AND status='at_pickup' 
           → propose status='in_transit', notify driver.
        B: GPS stationary >30min at pickup geofence AND status='in_transit'
           → flag for dispatcher review (don't auto-revert).
        C: GPS at delivery geofence >5min AND status='in_transit'
           → propose status='at_delivery', notify driver.
      Returns proposed action + reason.
    applyAutoSwitch(load_uuid, new_status, reason) →
      Updates dispatch.loads.status, emits audit_event tagged 
      auto_switched=true, notifies driver PWA.

PIECE B — Routes
  POST /api/integrations/samsara/auto-status-switch/detect/:load_uuid
  POST /api/integrations/samsara/auto-status-switch/apply (system-internal)
  GET  /api/integrations/samsara/auto-status-switch/recent (for dashboard)

PIECE C — Background worker
  auto-status-switch-worker.ts:
    Runs every 5min.
    For each active load: detectStatusDrift + auto-apply if case A or C.
    Case B → write to dispatch.intransit_issues for dispatcher review.

PIECE D — Frontend badge
  AutoStatusSwitchedBadge.tsx: small badge next to status pill on dispatch 
    board indicating "auto" with hover tooltip showing reason.

PIECE E — PWA notice
  AutoStatusNotice.tsx: banner appears in driver PWA when status was 
    auto-switched, with confirm/dispute buttons.

PIECE F — CI guard
  verify-cap-4-auto-status-switch.mjs: worker registered, routes registered, 
    badge + notice rendered.

PIECE G — Tests
  detector.test.ts: each case (A, B, C), audit event tagged correctly, 
    RLS isolation, idempotency.

PIECE H — Docs
  docs/specs/gap-56-cap-4-auto-status-switch.md

ACCEPTANCE:
[ ] Worker runs every 5min
[ ] Case A auto-applies + notifies driver
[ ] Case B writes to in-transit issues (dispatcher review)
[ ] Case C auto-applies at delivery
[ ] Audit event always tagged auto_switched=true
[ ] Badge + PWA notice render
[ ] verify-cap-4-auto-status-switch.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if false positives >5% in test data (auto-switches that drivers 
       dispute), STOP — tune thresholds before broader deploy.

POST-MERGE NEXT STEPS: feeds dispatch board tri-signal (GAP-57).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
