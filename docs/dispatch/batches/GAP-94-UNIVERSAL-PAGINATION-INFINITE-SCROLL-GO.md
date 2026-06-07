═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-94 — Universal Pagination + Infinite Scroll
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-V  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-93 (Lane A) — same wave P2-V

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-93 owned):
  apps/frontend/src/components/shared/InlineAddNewWidget.tsx
  apps/frontend/src/hooks/useInlineCreate.ts

ALLOWED FILES (disjoint from Lane A):
  apps/frontend/src/components/shared/PaginationBar.tsx                      (NEW)
  apps/frontend/src/components/shared/InfiniteScroll.tsx                     (NEW)
  apps/frontend/src/hooks/usePagedQuery.ts                                   (NEW)
  apps/frontend/src/hooks/useInfiniteQuery.ts                                (NEW)
  apps/frontend/src/pages/customers/CustomerList.tsx                         (EDIT — wire pagination)
  apps/frontend/src/pages/vendors/VendorList.tsx                             (EDIT — wire pagination)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                         (EDIT — wire infinite scroll)
  apps/frontend/src/pages/accounting/invoices/InvoiceList.tsx                (EDIT — wire pagination)
  apps/backend/src/lib/pagination/cursor-pagination.ts                       (NEW)
  scripts/verify-pagination-applied.mjs                                      (NEW CI guard)
  docs/specs/gap-94-pagination-infinite-scroll.md                            (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Lists with thousands of rows currently load everything · 
        Customer list (2,655 rows), vendor list (2,744 rows) → slow loads

PROBLEM: Lists with 1000+ rows take 5-10s to render. No pagination or 
infinite scroll. Memory pressure on browser. Mobile especially slow.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend cursor pagination
  cursor-pagination.ts: shared helper for cursor-based pagination 
    (preferred over offset for large tables).

PIECE B — Components
  PaginationBar.tsx: page X of Y + per-page selector + prev/next
  InfiniteScroll.tsx: intersection-observer based, auto-loads next page

PIECE C — Hooks
  usePagedQuery.ts: paged data fetching with cache
  useInfiniteQuery.ts: infinite scroll with cache + dedup

PIECE D — Wire into 4 lists
  CustomerList.tsx EDIT: PaginationBar (default 50 per page)
  VendorList.tsx EDIT: PaginationBar
  DispatchBoard.tsx EDIT: InfiniteScroll (always-load-more UX)
  InvoiceList.tsx EDIT: PaginationBar

PIECE E — CI guard
  verify-pagination-applied.mjs:
    Scans the 4 lists for pagination/scroll usage
    Fails if any list directly renders all rows without pagination

PIECE F — Tests
  cursor-pagination.test.ts: cursor encoding, stable ordering
  Hooks tested via React Testing Library

PIECE G — Docs
  docs/specs/gap-94-pagination-infinite-scroll.md

ACCEPTANCE:
[ ] PaginationBar in 3 lists, InfiniteScroll in DispatchBoard
[ ] Initial load <500ms on 1000+ row datasets
[ ] No regression
[ ] verify-pagination-applied.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if pagination cursor unstable (rows reorder between pages), STOP — 
       ordering deterministic requirement.

POST-MERGE NEXT STEPS: apply pattern to all remaining lists.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
