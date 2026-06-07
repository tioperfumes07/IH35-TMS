═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-8 — G26 Assignments Quicksave (Inline Edit)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-C  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-7 (Lane A) — same wave G-C

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-7 owned):
  apps/backend/src/maintenance/severe-repair/**
  apps/frontend/src/pages/maintenance/**
  apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/dispatch/assignments/quicksave.service.ts                (NEW)
  apps/backend/src/dispatch/assignments/quicksave.routes.ts                 (NEW)
  apps/backend/src/dispatch/assignments/__tests__/quicksave.test.ts         (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                        (EDIT — inline cells)
  apps/frontend/src/components/dispatch/InlineUnitPicker.tsx                (NEW)
  apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx             (NEW)
  apps/frontend/src/components/dispatch/InlineDriverPicker.tsx              (NEW)
  apps/frontend/src/lib/optimisticPatch.ts                                  (NEW)
  scripts/verify-assignments-quicksave.mjs                                  (NEW CI guard)
  docs/specs/gap-8-assignments-quicksave.md                                 (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G26 master rule — "Click truck/trailer in assignments to autofill 
        another unit + quicksave" · Jorge UX feedback · No modal acceptable

PROBLEM: Dispatch board currently requires opening a modal to reassign truck
or trailer. Operators want inline-edit with typeahead and autosave (no modal,
no confirm dialog) for high-volume dispatch operations.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend service + routes
  quicksave.service.ts:
    - reassignUnit(load_uuid, unit_uuid) → validate availability + RLS, return updated row
    - reassignTrailer(load_uuid, trailer_uuid) → same
    - reassignDriver(load_uuid, driver_uuid) → same + WF-038 active-driver check
    All emit audit_event with prior_value + new_value.
  Routes (PATCH for partial update semantics):
    PATCH /api/dispatch/loads/:uuid/assign-unit    body: {unit_uuid}
    PATCH /api/dispatch/loads/:uuid/assign-trailer body: {trailer_uuid}
    PATCH /api/dispatch/loads/:uuid/assign-driver  body: {driver_uuid}
  Returns 422 with E_VALIDATION_DRIVER_INACTIVE / E_VALIDATION_UNIT_UNAVAILABLE / etc.

PIECE B — Frontend inline pickers
  InlineUnitPicker.tsx: 
    - Renders as cell content (display: unit display_id or "—")
    - Click → typeahead overlay (positioned absolutely over cell)
    - Filter: master_data.units WHERE is_dispatch_blocked=false (per WF-050)
    - Enter → optimisticPatch fire + close overlay
  Same pattern for Trailer and Driver pickers.

PIECE C — Optimistic update helper
  optimisticPatch.ts:
    - Update local row state immediately
    - Fire PATCH request in background
    - On 422: rollback + show inline error pill on the cell
    - On 200: confirm (no UI flash)

PIECE D — DispatchBoard wiring
  DispatchBoard.tsx: replace static truck/trailer/driver cells with new 
  inline picker components. No modal, no confirm button.

PIECE E — CI guard
  verify-assignments-quicksave.mjs: routes registered, inline pickers in 
  DispatchBoard, no modal-based reassign component remaining.

PIECE F — Tests
  quicksave.test.ts: happy path, validation failures, RLS isolation, 
  WF-038 inactive-driver block, audit event emitted.

PIECE G — Docs
  docs/specs/gap-8-assignments-quicksave.md

ACCEPTANCE:
[ ] Click truck cell → typeahead overlay appears
[ ] Enter selection → autosave + cell updates
[ ] Invalid selection → rollback + error pill
[ ] Audit event captures prior + new value
[ ] verify-assignments-quicksave.mjs in CI chain
[ ] No regression on existing dispatch flows

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if optimistic rollback test fails (UI doesn't revert on 422), STOP — 
       data integrity risk shipping inconsistent UI.

POST-MERGE NEXT STEPS: Pattern reusable for any inline-edit need 
(GAP-93 universal "+ Add new" buttons consume same pattern).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
