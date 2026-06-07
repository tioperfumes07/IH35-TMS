═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-16 — Validation Engine Pre-Accounting Compliance Panel
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-G  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP queue unpauses (CLOSURE-30 PASS-8 GO)
PAIRED WITH: GAP-17 (Lane B) — same wave G-G

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-17 owned):
  apps/backend/src/maintenance/arriving-soon/**
  apps/frontend/src/pages/maintenance/home/ArrivingSoonQueue.tsx
  apps/frontend/src/pages/home/MaintenanceArrivingSoonCard.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/accounting/validation/pre-accounting-validator.service.ts (NEW)
  apps/backend/src/accounting/validation/pre-accounting.routes.ts            (NEW)
  apps/backend/src/accounting/validation/__tests__/pre-accounting.test.ts    (NEW)
  apps/frontend/src/components/accounting/PreAccountingValidationPanel.tsx   (NEW)
  apps/frontend/src/pages/accounting/expenses/ExpenseCreate.tsx              (EDIT — embed panel)
  apps/frontend/src/pages/accounting/bills/BillCreate.tsx                    (EDIT — embed panel)
  apps/frontend/src/pages/accounting/journal-entries/JournalEntryCreate.tsx  (EDIT — embed panel)
  scripts/verify-pre-accounting-validation.mjs                               (NEW CI guard)
  docs/specs/gap-16-validation-pre-accounting.md                             (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan item #11 · Reuses shared ValidationPanel from
        GAP-14 · Period close + chart-of-accounts roles + posting-engine
        compliance not surfaced today

PROBLEM: Operators can:
  - Post a bill into a CLOSED accounting period (silent acceptance, then 
    journal entry creation throws E_ACCOUNTING_PERIOD_CLOSED)
  - Create journal entry where Dr/Cr accounts lack required CoA roles 
    (e.g., posting to non-AR account through AR resolver)
  - Submit expense with missing required category mapping
  - Trigger QBO sync drift via local edits during period-close window
No visible warnings before submission → re-work loops + accounting errors.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend validator service
  pre-accounting-validator.service.ts:
    validatePreAccounting({
      action: 'create_bill'|'create_expense'|'create_je'|'post_settlement',
      payload: {...}
    }) → {blockers, warnings, info}
    Checks:
      - Posting date in CLOSED period → block (cite Block-11)
      - Posting date in LOCKED period → warn (Owner override possible)
      - Account on Dr/Cr lines missing required role → block 
        (cite Block-35 roles when shipped)
      - Required category mapping missing (Block-21) → warn
      - QBO sync queue depth > threshold → warn (delay posting risk)
      - Period close in next 24h + draft entries exist → warn

PIECE B — Route
  POST /api/accounting/validation/pre-accounting body: {action, payload}

PIECE C — Frontend panel
  PreAccountingValidationPanel.tsx: 
    Consumes shared ValidationPanel from GAP-14
    Used by ExpenseCreate / BillCreate / JournalEntryCreate
    Calls validator on every field change (debounced 300ms)
    Submit button gated on no blockers

PIECE D — Wire into 3 forms
  ExpenseCreate.tsx: embed above submit
  BillCreate.tsx: embed above submit
  JournalEntryCreate.tsx: embed above submit

PIECE E — CI guard
  verify-pre-accounting-validation.mjs:
    Route registered
    Panel rendered in all 3 forms
    Submit blocking enforced on blockers
    Wired into verify:arch-design

PIECE F — Tests
  pre-accounting.test.ts: each rule (closed period, missing role, missing 
    category, QBO drift), Owner override flow, RLS isolation.

PIECE G — Docs
  docs/specs/gap-16-validation-pre-accounting.md (cite Block-11, Block-21, 
  Block-35, GAP-14 shared component)

ACCEPTANCE:
[ ] Validator returns correct severity per rule
[ ] Panel renders in all 3 forms
[ ] Submit blocked with any blocker
[ ] Owner override emits WF-064 audit
[ ] verify-pre-accounting-validation.mjs in CI chain
[ ] No regression on existing create flows

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if period-closed check fires false positive (open period flagged as
       closed), STOP — period state machine could have drift.

POST-MERGE NEXT STEPS: 3-panel validation chain complete (GAP-14 pre-dispatch,
       GAP-15 pre-settlement, GAP-16 pre-accounting) covers full WF compliance.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
