═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-95 — Bulk Actions on List Views
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-W  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-96 (Lane B) — same wave P2-W

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-96 owned):
  apps/frontend/src/components/shared/SavedFilters.tsx
  apps/backend/src/lib/saved-filters/**

ALLOWED FILES (disjoint from Lane B):
  apps/frontend/src/components/shared/BulkActionBar.tsx                      (NEW)
  apps/frontend/src/hooks/useBulkSelection.ts                                (NEW)
  apps/backend/src/lib/bulk-actions/processor.service.ts                     (NEW)
  apps/backend/src/lib/bulk-actions/routes.ts                                (NEW)
  apps/backend/src/lib/bulk-actions/__tests__/                               (NEW)
  apps/frontend/src/pages/customers/CustomerList.tsx                         (EDIT — wire bulk)
  apps/frontend/src/pages/dispatch/loads/LoadList.tsx                        (EDIT — wire bulk)
  apps/frontend/src/pages/accounting/invoices/InvoiceList.tsx                (EDIT — wire bulk)
  scripts/verify-bulk-actions.mjs                                            (NEW CI guard)
  docs/specs/gap-95-bulk-actions.md                                          (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Bulk re-tag, bulk export, bulk archive · 
        Operator productivity for routine list management

PROBLEM: Operating on 50 customers / 100 loads one at a time. No way to 
select multiple + apply action (bulk archive, bulk export, bulk re-tag).

SCOPE — ADDITIVE ONLY:

PIECE A — Selection hook
  useBulkSelection.ts: 
    Manages selected set across pages
    Select all / select none / range select with shift-click

PIECE B — Bulk action bar
  BulkActionBar.tsx: 
    Appears when >0 rows selected
    Shows: count + available actions (varies per entity)
    Confirms before destructive actions

PIECE C — Processor
  processor.service.ts:
    processBulkAction({entity_type, action, target_uuids, params, user_uuid}) →
      Validates RBAC per action
      Runs in transaction (all or none)
      Emits audit_event per row affected
      Returns success/failure summary

PIECE D — Routes
  POST /api/lib/bulk-actions body: {entity_type, action, uuids, params}

PIECE E — Wire into 3 lists
  CustomerList.tsx EDIT: bulk export CSV, bulk archive
  LoadList.tsx EDIT: bulk export, bulk re-assign dispatcher
  InvoiceList.tsx EDIT: bulk export, bulk mark as printed (no payment-related 
    bulk actions — those need per-row review)

PIECE F — CI guard
  verify-bulk-actions.mjs: backend processor + UI bar present in 3 lists.

PIECE G — Tests
  processor.test.ts: transaction integrity, RBAC, audit per row, partial 
    failure handling (rollback all).

PIECE H — Docs
  docs/specs/gap-95-bulk-actions.md

ACCEPTANCE:
[ ] Selection persists across pages
[ ] Bulk action bar appears with count
[ ] Action processes in transaction
[ ] Audit per row affected
[ ] No bulk action on payment/financial-critical (per safety rule)
[ ] verify-bulk-actions.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if bulk action exceeds 5000 rows, STOP and require chunked process 
       with progress UI (prevent timeout).

POST-MERGE NEXT STEPS: future list views consume same pattern.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
