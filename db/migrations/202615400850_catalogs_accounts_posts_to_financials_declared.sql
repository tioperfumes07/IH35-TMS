-- 202615400850_catalogs_accounts_posts_to_financials_declared.sql
-- CC-2 — declare a column production already has, so a database built from the migrations matches it.
--
-- catalogs.accounts.posts_to_financials is live on production as boolean NOT NULL DEFAULT true (measured 2026-10-06,
-- information_schema), but no migration ever created it: it was added outside the chain. 202615400930 (reefer diesel
-- 5015) inserts into it, so a fresh database — CI, verify:local-ci, a DR restore, a rehearsal from zero — dies there
-- with "column posts_to_financials of relation accounts does not exist" (CC-3 finding 2026-10-04,
-- docs/bus/2026-10-04-CC-3-FINDING-POSTS-TO-FINANCIALS-NO-MIGRATION.md). This file sorts before 202615400930.
--
-- Production: ADD COLUMN IF NOT EXISTS is a no-op (the column exists with this exact definition). No data moves.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS posts_to_financials boolean NOT NULL DEFAULT true;

COMMIT;
