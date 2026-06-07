═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-93 — Universal "+ Add New" Inline Pattern
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-V  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-94 (Lane B) — same wave P2-V

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-94 owned):
  apps/frontend/src/components/shared/PaginationBar.tsx
  apps/frontend/src/components/shared/InfiniteScroll.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/frontend/src/components/shared/InlineAddNewWidget.tsx                 (NEW)
  apps/frontend/src/hooks/useInlineCreate.ts                                 (NEW)
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx                    (EDIT — inline customer add)
  apps/frontend/src/pages/accounting/invoices/CreateInvoice.tsx              (EDIT — inline product add)
  apps/frontend/src/pages/accounting/bills/BillCreate.tsx                    (EDIT — inline vendor add)
  apps/frontend/src/pages/dispatch/loads/AssignmentEdit.tsx                  (EDIT — inline driver add)
  scripts/verify-inline-add-new.mjs                                          (NEW CI guard)
  docs/specs/gap-93-universal-add-new.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge UX feedback · Booking a load and the customer doesn't exist 
        yet → forced to abandon flow, go to customer module, create, return ·
        Pattern: typeahead picker with "+ Add new X" at bottom

PROBLEM: All entity pickers (customer, vendor, driver, unit, product) lack
inline-create. Forces context switch + flow abandonment.

SCOPE — ADDITIVE ONLY:

PIECE A — Reusable widget
  InlineAddNewWidget.tsx:
    Props: {entity_type, onCreated, quick_fields}
    Renders as compact form below typeahead picker
    Submits minimal required fields → entity created
    Returns created entity to parent (callback)

PIECE B — Hook
  useInlineCreate.ts: 
    Generic mutation hook with optimistic update + rollback on failure.

PIECE C — Wire into 4 flows
  BookLoad.tsx EDIT: customer picker → "+ Add new customer" → quick form
    (name, email, billing terms) → returns customer for selection
  CreateInvoice.tsx EDIT: same for product/service
  BillCreate.tsx EDIT: same for vendor
  AssignmentEdit.tsx EDIT: same for driver (minimal: name + phone + CDL #)

PIECE D — CI guard
  verify-inline-add-new.mjs:
    Scans the 4 pickers for InlineAddNewWidget usage
    Wired into verify:arch-design

PIECE E — Tests
  hook test: optimistic + rollback
  Widget test: form validation, RLS

PIECE F — Docs
  docs/specs/gap-93-universal-add-new.md

ACCEPTANCE:
[ ] Widget renders in all 4 picker contexts
[ ] Inline create works without leaving flow
[ ] Created entity immediately usable
[ ] verify-inline-add-new.mjs in CI chain
[ ] No regression on existing picker functionality

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if inline-created entity not visible in subsequent search, STOP — 
       index propagation issue.

POST-MERGE NEXT STEPS: extend pattern to all other pickers (insurance 
       claims, permits, etc.).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
