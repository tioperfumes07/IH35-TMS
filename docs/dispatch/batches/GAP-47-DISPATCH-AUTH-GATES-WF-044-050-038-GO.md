═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-47 — §5 Dispatch Authorization Gates WF-044/050/038
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-V  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-46 (Lane A) — same wave G-V
SEQUENCING: SEC-CLEARED via CLOSURE-19 (shipped #575) — eligible at GAP unpause

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-46 owned):
  apps/backend/src/safety/anomaly/**
  apps/frontend/src/pages/safety/anomaly/**
  migrations/0319_anomaly_alert_rules.sql

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/dispatch/auth-gates/gate-registry.service.ts              (NEW)
  apps/backend/src/dispatch/auth-gates/wf-044-advisory.gate.ts               (NEW)
  apps/backend/src/dispatch/auth-gates/wf-050-dvir-major.gate.ts             (NEW)
  apps/backend/src/dispatch/auth-gates/wf-038-active-driver.gate.ts          (NEW)
  apps/backend/src/dispatch/auth-gates/routes.ts                             (NEW)
  apps/backend/src/dispatch/auth-gates/__tests__/                            (NEW dir)
  apps/frontend/src/components/dispatch/AuthGatePanel.tsx                    (NEW)
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx                    (EDIT — embed gates)
  apps/frontend/src/pages/dispatch/assignments/AssignmentEdit.tsx            (EDIT — embed gates)
  scripts/verify-dispatch-auth-gates-wired.mjs                               (NEW CI guard)
  docs/specs/gap-47-dispatch-auth-gates.md                                   (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: UA §5 Dispatch Authorization Gates · WF-044 (advisory PM-due warn), 
        WF-050 (DVIR major defect hard-block), WF-038 (active-driver enforce) ·
        CLOSURE-19 SEC audit shipped + cleared this for GAP queue

PROBLEM: Validation rules exist in backend (WF-044/050/038) but enforcement 
is inconsistent:
  - Some routes call WF-050 check, others don't
  - WF-044 PM warnings shown in console only, not user-facing
  - WF-038 active-driver check bypassed when driver assigned via specific 
    edge-case path
Inconsistent enforcement = legal/safety liability.

SCOPE — ADDITIVE ONLY:

PIECE A — Gate registry service
  gate-registry.service.ts:
    Central registry pattern:
      registerGate(action_slug, gate_fn)
      checkGates(action_slug, context) → {pass: bool, blockers, warnings}
    Every dispatch mutation route calls checkGates() before proceeding.

PIECE B — Per-gate implementations
  wf-044-advisory.gate.ts:
    PM due within X days → return warning (not blocker)
    Cite WF-044 in result.
  wf-050-dvir-major.gate.ts:
    Open DVIR with major defect on this unit → return blocker
    Cite WF-050.
  wf-038-active-driver.gate.ts:
    Driver inactive (status != active OR is_dispatch_blocked) → blocker
    Cite WF-038.

PIECE C — Routes
  GET /api/dispatch/auth-gates/check?action=book_load&load_uuid=&unit_uuid=&driver_uuid=
  Returns {blockers, warnings, info} structured response.

PIECE D — Frontend AuthGatePanel
  AuthGatePanel.tsx: reusable component consuming above route.
    Renders blockers (red, blocking), warnings (amber, ack-required), 
    info (blue).
    Used in BookLoad + AssignmentEdit + any dispatch mutation flow.

PIECE E — Wire into BookLoad + AssignmentEdit
  BookLoad.tsx EDIT: embed AuthGatePanel between step 3 (driver assignment) 
    and step 4 (review). Book button disabled if any blocker.
  AssignmentEdit.tsx EDIT: panel inline above save. Save disabled if blocker.

PIECE F — CI guard
  verify-dispatch-auth-gates-wired.mjs:
    Every dispatch mutation route calls gate-registry.checkGates()
    AuthGatePanel rendered in BookLoad + AssignmentEdit
    WF-044/050/038 all wired

PIECE G — Tests
  Per-gate unit tests: pass/blocker/warning cases
  Integration tests: full Book Load flow with gates blocking, gates warning, 
    gates passing.

PIECE H — Docs
  docs/specs/gap-47-dispatch-auth-gates.md (cite WF-044, WF-050, WF-038, §5)

ACCEPTANCE:
[ ] Gate registry pattern enforced (all dispatch routes use it)
[ ] WF-050 blockers prevent assignment
[ ] WF-044 warnings surface but allow override (audited)
[ ] WF-038 blockers prevent inactive-driver assignment
[ ] AuthGatePanel renders in BookLoad + AssignmentEdit
[ ] verify-dispatch-auth-gates-wired.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any existing dispatch route bypasses gate check, STOP — 
       enforcement must be 100% to be meaningful.

POST-MERGE NEXT STEPS: Similar gate pattern reusable for settlements (GAP-15), 
       accounting (GAP-16). Same registry can hold those.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
