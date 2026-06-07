═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-15 — Validation Engine Pre-Settlement Debt Warnings
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-F  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-14 (Lane A) — same wave G-F

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-14 owned):
  apps/backend/src/dispatch/validation/**
  apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx
  apps/frontend/src/components/shared/ValidationPanel.tsx (Lane A creates; Lane B consumes only)
  apps/frontend/src/pages/dispatch/**

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/accounting/settlements/pre-settlement-validation/validator.service.ts  (NEW)
  apps/backend/src/accounting/settlements/pre-settlement-validation/routes.ts             (NEW)
  apps/backend/src/accounting/settlements/__tests__/pre-settlement.test.ts                (NEW)
  apps/frontend/src/components/settlements/PreSettlementValidationPanel.tsx               (NEW)
  apps/frontend/src/pages/accounting/settlements/SettlementDetail.tsx                     (EDIT — embed)
  apps/frontend/src/pages/accounting/settlements/SettlementLock.tsx                       (EDIT — gate)
  scripts/verify-pre-settlement-validation.mjs                                            (NEW CI guard)
  docs/specs/gap-15-validation-pre-settlement.md                                          (NEW)
  .block-ready.json                                                            (MANIFEST FIRST)

SOURCE: ChatGPT execution plan item #11 · Settlement debt warnings are 
        scattered today (CSV exports, manual checks) · WF-055 settlement 
        lock should be informed by validation panel

PROBLEM: Operator can lock settlement with:
  - Outstanding driver debt above policy threshold (no warning)
  - Pending driver acknowledgments (no warning)
  - Near-completion deductions that should have been settled (no warning)
  - Escrow balance issues (no warning)
Once locked, settlement is hard to reverse.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend validator
  validator.service.ts:
    validatePreSettlement({settlement_uuid, driver_uuid}) → 
    {blockers: [], warnings: [...], info: [...]}
    Checks:
      - Driver debt > debt_threshold_policy → warn (Owner override required)
      - Pending acknowledgments older than 7 days → warn
      - Deductions ready to complete (final installment due) → info
      - Escrow balance < 0 → block (forfeiture before settlement)
      - QBO sync drift on this driver's vendor mirror → warn

PIECE B — Route
  POST /api/accounting/settlements/validation/pre-settlement
       body: {settlement_uuid, driver_uuid}

PIECE C — Frontend panel
  PreSettlementValidationPanel.tsx: consumes shared ValidationPanel from GAP-14
    Renders in SettlementDetail.tsx + SettlementLock.tsx.
    Lock button disabled with any blocker.
    Owner override flow for warnings: WF-064 lightning-bolt 2-step confirm.

PIECE D — Lock gate
  SettlementLock.tsx EDIT: 
    Call validator before lock → if blockers, refuse.
    If warnings + Owner role: show override modal with WF-064 confirmation.

PIECE E — CI guard
  verify-pre-settlement-validation.mjs:
    Route registered, panel rendered, lock gate enforced, WF-064 wired.

PIECE F — Tests
  pre-settlement.test.ts: each rule, Owner override flow, audit event.

PIECE G — Docs
  docs/specs/gap-15-validation-pre-settlement.md

ACCEPTANCE:
[ ] Validator covers all 5 rules
[ ] Panel renders correctly
[ ] Lock blocked with blockers
[ ] Owner override fires WF-064 audit
[ ] verify-pre-settlement-validation.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if WF-064 audit event not emitted on override, STOP — high-risk 
       action chain-of-custody requirement.

POST-MERGE NEXT STEPS: GAP-16 reuses same ValidationPanel pattern for 
pre-accounting (bill-post / expense-post).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
