═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-96 — Saved Filters + Custom List Views
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-W  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-95 (Lane A) — same wave P2-W

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-95 owned):
  apps/frontend/src/components/shared/BulkActionBar.tsx
  apps/backend/src/lib/bulk-actions/**

ALLOWED FILES (disjoint from Lane A):
  migrations/0335_saved_filters.sql                                          (NEW)
  apps/backend/src/lib/saved-filters/service.ts                              (NEW)
  apps/backend/src/lib/saved-filters/routes.ts                               (NEW)
  apps/backend/src/lib/saved-filters/__tests__/                              (NEW)
  apps/frontend/src/components/shared/SavedFilters.tsx                       (NEW)
  apps/frontend/src/hooks/useSavedFilters.ts                                 (NEW)
  apps/frontend/src/pages/customers/CustomerList.tsx                         (EDIT — wire)
  apps/frontend/src/pages/dispatch/loads/LoadList.tsx                        (EDIT — wire)
  apps/frontend/src/pages/accounting/invoices/InvoiceList.tsx                (EDIT — wire)
  scripts/verify-saved-filters.mjs                                           (NEW CI guard)
  docs/specs/gap-96-saved-filters.md                                         (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Power user pattern · "Show me all overdue invoices for ABC 
        Trucking last 30 days" — save filter for one-click re-access

PROBLEM: Same complex filters re-built daily. "Active loads, dispatcher 
Maria, going to TX" — operator manually applies 3 filters every morning. 
Need save + share.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0335
  CREATE TABLE IF NOT EXISTS lib.saved_filters (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    created_by_user_uuid UUID NOT NULL,
    entity_type TEXT NOT NULL,
    filter_name TEXT NOT NULL,
    filter_definition JSONB NOT NULL,
    is_shared BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_sf_user_entity ON lib.saved_filters(created_by_user_uuid, entity_type);
  CREATE INDEX idx_sf_shared ON lib.saved_filters(operating_company_id, entity_type) WHERE is_shared = true;
  GRANT SELECT, INSERT, UPDATE ON lib.saved_filters TO app_user;

PIECE B — Service
  service.ts:
    createFilter(data) → uuid
    listFilters(user_uuid, entity_type) → user's + shared filters
    setDefault(user_uuid, filter_uuid)
    softDelete(filter_uuid) → is_active=false (additive-only)

PIECE C — Routes
  POST   /api/lib/saved-filters
  GET    /api/lib/saved-filters?entity_type=
  PATCH  /api/lib/saved-filters/:uuid
  PATCH  /api/lib/saved-filters/:uuid/set-default
  PATCH  /api/lib/saved-filters/:uuid/deactivate

PIECE D — Frontend
  SavedFilters.tsx: dropdown in list toolbar with saved + shared filters
  useSavedFilters.ts: hook with cache + autoload default

PIECE E — Wire into 3 lists
  CustomerList.tsx + LoadList.tsx + InvoiceList.tsx EDIT: SavedFilters in toolbar.

PIECE F — CI guard
  verify-saved-filters.mjs: migration, routes, SavedFilters in 3 lists.

PIECE G — Tests
  service.test.ts: CRUD, share visibility, default per user, RLS.

PIECE H — Docs
  docs/specs/gap-96-saved-filters.md

ACCEPTANCE:
[ ] Migration 0335 applied
[ ] Save / load / share filters works
[ ] Default loads on list mount
[ ] Soft-delete only (additive-only enforced)
[ ] verify-saved-filters.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if filter definition stored in URL doesn't round-trip, STOP — 
       shared filter URLs must work.

POST-MERGE NEXT STEPS: filters become bookmarkable URLs; teams can share.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
