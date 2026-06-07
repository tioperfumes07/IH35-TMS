═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-14 — Validation Engine Pre-Dispatch Panel
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-F  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-15 (Lane B) — same wave G-F

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-15 owned):
  apps/backend/src/accounting/settlements/pre-settlement-validation/**
  apps/frontend/src/components/settlements/PreSettlementValidationPanel.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts    (NEW)
  apps/backend/src/dispatch/validation/pre-dispatch.routes.ts               (NEW)
  apps/backend/src/dispatch/validation/__tests__/pre-dispatch.test.ts       (NEW)
  apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx      (NEW)
  apps/frontend/src/components/shared/ValidationPanel.tsx                   (NEW reusable)
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx                   (EDIT — embed panel)
  apps/frontend/src/pages/dispatch/assignments/AssignmentEdit.tsx           (EDIT — embed panel)
  scripts/verify-pre-dispatch-validation.mjs                                (NEW CI guard)
  docs/specs/gap-14-validation-pre-dispatch.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan item #11 · WF-044 (advisory) + WF-050 
        (DVIR hard-block) + WF-038 (active-driver) need surfaced UI · 
        Validation cannot be implicit; operator must see and acknowledge

PROBLEM: Pre-dispatch validation rules (CDL expiry, medical card, permits, 
insurance, PM-due, DVIR major defect, driver active) fire in backend but 
operator sees no visible warnings before assigning. WF-050 hard-block 
returns 422 but with no context.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend validator service
  pre-dispatch-validator.service.ts:
    validatePreDispatch({load_uuid, unit_uuid, trailer_uuid, driver_uuid}) →
    {
      blockers: [{rule_id: 'WF-050-DVIR-MAJOR', severity: 'block', message, evidence}],
      warnings: [{rule_id: 'WF-044-PM-DUE', severity: 'warn', message, evidence}],
      info: [{...}]
    }
    Checks (each one independently testable):
      - CDL expiry < 30 days → warn
      - CDL expired → block
      - Medical card expired → block
      - Insurance lapsed → block
      - Driver inactive (WF-038) → block
      - Unit PM overdue → warn (WF-044)
      - Unit DVIR major defect open → block (WF-050)
      - Trailer registration expired → warn
      - Load destination requires permit not held → warn

PIECE B — Route
  POST /api/dispatch/validation/pre-dispatch body: {load_uuid?, unit_uuid?, ...}

PIECE C — Reusable ValidationPanel component
  ValidationPanel.tsx:
    Props: {result: {blockers, warnings, info}, onAck: () => void}
    Renders red blockers (cannot ack until cleared), amber warnings 
    (acknowledgeable), blue info.
    Used by both pre-dispatch + pre-settlement + pre-accounting (GAP-15/16).

PIECE D — Pre-dispatch wrapper
  PreDispatchValidationPanel.tsx: calls /api/dispatch/validation/pre-dispatch 
    on every BookLoad/AssignmentEdit field change, renders ValidationPanel.

PIECE E — Wire into Book Load + Assignment Edit
  BookLoad.tsx EDIT: embed panel between step 3 (driver assignment) and 
    step 4 (review). "Book" button disabled until no blockers remain.
  AssignmentEdit.tsx EDIT: panel inline above save button.

PIECE F — CI guard
  verify-pre-dispatch-validation.mjs:
    - Route registered
    - Panel rendered in both BookLoad and AssignmentEdit
    - "Book" button blocking logic enforced
    - Wired into verify:arch-design

PIECE G — Tests
  pre-dispatch.test.ts: each rule fires correctly, severity correct, 
    block-vs-warn semantics, RLS isolation.

PIECE H — Docs
  docs/specs/gap-14-validation-pre-dispatch.md (cite WF-044, WF-050, WF-038)

ACCEPTANCE:
[ ] Validator returns correct severity per rule
[ ] Panel renders blockers + warnings + info distinctly
[ ] Book button disabled with any blocker
[ ] Warnings allow operator ack (audit event)
[ ] verify-pre-dispatch-validation.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any rule incorrectly classified (warn vs block), STOP — Jorge 
       WF spec is precise.

POST-MERGE NEXT STEPS: ValidationPanel reused by GAP-15 (pre-settlement) 
and GAP-16 (pre-accounting).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
