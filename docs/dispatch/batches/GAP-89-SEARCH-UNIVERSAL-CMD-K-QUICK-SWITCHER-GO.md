═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-89 — Universal Cmd-K Quick Switcher Search
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-T  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-90 (Lane B) — same wave P2-T

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-90 owned):
  apps/backend/src/notifications/center/**
  apps/frontend/src/components/notifications/NotificationCenter.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/search/universal/indexer.service.ts                       (NEW)
  apps/backend/src/search/universal/query.service.ts                         (NEW)
  apps/backend/src/search/universal/routes.ts                                (NEW)
  apps/backend/src/search/universal/__tests__/                               (NEW)
  apps/backend/src/jobs/search-indexer-incremental.ts                        (NEW)
  apps/frontend/src/components/shared/CmdKQuickSwitcher.tsx                  (NEW)
  apps/frontend/src/components/shared/SearchResultItem.tsx                   (NEW)
  apps/frontend/src/layouts/AppLayout.tsx                                    (EDIT — add Cmd+K listener)
  migrations/0332_search_index.sql                                           (NEW)
  scripts/verify-cmd-k-quick-switcher.mjs                                    (NEW CI guard)
  docs/specs/gap-89-cmd-k-quick-switcher.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Modern SaaS UX standard · Quickly jump to any load/driver/unit/
        customer/invoice by typing · Power user productivity

PROBLEM: To find a specific load or driver, user must navigate to module 
then search. Cmd+K (or Ctrl+K) modal that searches everything from 
anywhere = 10× productivity boost.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0332
  CREATE TABLE IF NOT EXISTS search.universal_index (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_uuid UUID NOT NULL,
    display_text TEXT NOT NULL,
    search_text TSVECTOR NOT NULL,
    secondary_text TEXT,
    url_path TEXT NOT NULL,
    icon TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_type, entity_uuid)
  );
  CREATE INDEX idx_search_tsvector ON search.universal_index USING GIN(search_text);
  CREATE INDEX idx_search_entity ON search.universal_index(entity_type);
  GRANT SELECT, INSERT, UPDATE, DELETE ON search.universal_index TO app_user;

PIECE B — Indexer service
  indexer.service.ts:
    indexEntity({entity_type, entity_uuid, display, search_terms, url, icon})
    UPSERT into universal_index.
    Hooked into load/driver/unit/customer/invoice create/update events.

PIECE C — Query service
  query.service.ts:
    universalSearch(query, opts={limit=20, entity_types=null}) →
      Postgres ts_query against search_text
      Returns ranked results across all entity types

PIECE D — Worker
  search-indexer-incremental.ts: catches up on any missed indexing 
    (full-table scan every 24h backup).

PIECE E — Routes
  GET /api/search/universal?q=&types=&limit=

PIECE F — Frontend
  CmdKQuickSwitcher.tsx: modal overlay activated by Cmd+K / Ctrl+K
    Real-time search (debounced 150ms)
    Keyboard navigation (arrows + enter)
    Recent searches history (last 10)
  SearchResultItem.tsx: per-result render with icon + entity badge
  AppLayout.tsx EDIT: register global keyboard listener.

PIECE G — CI guard
  verify-cmd-k-quick-switcher.mjs: migration, routes, modal renders, 
    keyboard listener wired.

PIECE H — Tests
  query.test.ts: ranking, RLS isolation, performance <100ms
  indexer.test.ts: upsert on entity change, idempotency

PIECE I — Docs
  docs/specs/gap-89-cmd-k-quick-switcher.md

ACCEPTANCE:
[ ] Migration 0332 applied
[ ] Cmd+K opens modal anywhere in app
[ ] Search returns results <200ms
[ ] Keyboard navigation works
[ ] RLS isolation enforced
[ ] verify-cmd-k-quick-switcher.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if index size >1M rows causes query slowdown, STOP and add 
       Elasticsearch consideration for future.

POST-MERGE NEXT STEPS: extends to more entity types (documents, audit 
       events, etc.) over time.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
