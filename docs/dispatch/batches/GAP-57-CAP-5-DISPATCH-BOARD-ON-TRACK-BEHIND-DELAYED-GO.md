═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-57 — CAP-5 Dispatch Board On-Track / Behind / Delayed Tri-Signal
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-D  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP-55 (live GPS) + GAP-56 (auto-status) ship
PAIRED WITH: GAP-58 (Lane B) — same wave P2-D

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-58 owned):
  apps/backend/src/integrations/samsara/engine-faults/**
  apps/backend/src/maintenance/work-orders/auto-create-from-fault.ts

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/dispatch/load-status-signal/tri-signal.service.ts        (NEW)
  apps/backend/src/dispatch/load-status-signal/tri-signal.routes.ts         (NEW)
  apps/backend/src/dispatch/load-status-signal/__tests__/tri-signal.test.ts (NEW)
  apps/backend/src/dispatch/load-status-signal/thresholds.config.ts         (NEW)
  apps/frontend/src/components/dispatch/TriSignalPill.tsx                   (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                        (EDIT — add tri-signal col)
  apps/frontend/src/pages/dispatch/TriSignalHoverDetail.tsx                 (NEW)
  scripts/verify-cap-5-tri-signal.mjs                                       (NEW CI guard)
  docs/specs/gap-57-cap-5-tri-signal.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-5 from Samsara Capabilities · "Three-signal combination feeds 
        dispatch status display" · combines HOS + GPS + driver acknowledgment

PROBLEM: Dispatch board today shows status as binary (assigned/in-transit/
delivered) with no nuance about whether driver is ON-TRACK to meet 
delivery time. Operators discover lateness only when delivery missed.

SCOPE — ADDITIVE ONLY:

PIECE A — Threshold config
  thresholds.config.ts:
    export const TRI_SIGNAL_THRESHOLDS = {
      onTrackMaxSlipMinutes: 60,        // up to 60min late ETA = ON TRACK
      behindMinSlipMinutes: 60,         // 60-180min slip = BEHIND  
      behindMaxSlipMinutes: 180,
      delayedMinSlipMinutes: 180,       // >180min slip = DELAYED
      delayedOnHosDepleted: true,       // HOS=0 always = DELAYED
      delayedOnNoMovementMinutes: 60,   // stationary >60min when should be moving = DELAYED
    };

PIECE B — Tri-signal service
  tri-signal.service.ts:
    computeTriSignal(load_uuid) →
      Inputs: scheduled_delivery_at, GPS ETA from Samsara, HOS remaining, 
              auto-status events from CAP-4, last driver acknowledgment.
      Output: {signal: 'on_track'|'behind'|'delayed', reason, slip_minutes, 
               hos_remaining_minutes, driver_ack_age_minutes}

PIECE C — Routes
  GET /api/dispatch/load-status-signal/:load_uuid
  GET /api/dispatch/load-status-signal/active-loads (board batch)

PIECE D — Frontend tri-signal pill
  TriSignalPill.tsx: green/amber/red pill with text "ON TRACK" / "BEHIND" / 
    "DELAYED". Hover → TriSignalHoverDetail showing slip + reason + HOS.

PIECE E — Dispatch board wiring
  DispatchBoard.tsx EDIT: add column "Status Signal" between Driver and 
    Customer columns. Renders TriSignalPill per row.

PIECE F — CI guard
  verify-cap-5-tri-signal.mjs: routes registered, pill rendered in 
    DispatchBoard, threshold config locked.

PIECE G — Tests
  tri-signal.test.ts: each signal path (on_track / behind / delayed), 
    HOS=0 short-circuit, no-movement case, edge cases (no GPS data).

PIECE H — Docs
  docs/specs/gap-57-cap-5-tri-signal.md

ACCEPTANCE:
[ ] Service returns correct signal per case
[ ] Thresholds match config (configurable per future ops decision)
[ ] Pill renders correctly with color + text
[ ] Hover detail shows accurate breakdown
[ ] verify-cap-5-tri-signal.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if dispatch board render performance drops >100ms (tri-signal 
       computation cost), STOP and optimize cache layer.

POST-MERGE NEXT STEPS: Owner dashboard could aggregate (count by signal) 
                       for fleet-wide visibility.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
