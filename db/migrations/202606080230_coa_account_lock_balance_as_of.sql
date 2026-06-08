-- CA-04 — Account Lock + Opening Balance As-Of date columns
-- Migration: 202606080230
--
-- Changes to catalogs.accounts:
--   1. DROP NOT NULL on account_number  (stays UNIQUE so multiple NULLs are fine under Postgres UNIQUE)
--   2. ADD COLUMN is_locked boolean NOT NULL DEFAULT false
--   3. ADD COLUMN opening_balance_as_of date (nullable)
--
-- GRANTs: explicit GRANT to ih35_app (idempotent).
-- No RLS added to catalogs.accounts because the table has no operating_company_id column;
-- row-level scoping happens via app.operating_company_id and SECURITY INVOKER on callers.

BEGIN;

-- 1. Make account_number optional (keep UNIQUE constraint intact).
ALTER TABLE catalogs.accounts
  ALTER COLUMN account_number DROP NOT NULL;

-- 2. Lock flag — prevents edits/archive server-side once set.
ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- 3. Date as of which the opening_balance_cents figure applies.
ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS opening_balance_as_of date;

-- Refresh GRANTs in case they were missed by earlier migrations.
GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.accounts TO ih35_app;

COMMIT;
