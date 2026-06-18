-- #3 — Record-Expense → driverless, CATEGORIZED, cash-out expense that POSTS to the GL (P-NOW).
-- Two additive, idempotent, reversible changes (no data rewrite, 0 existing rows violate):
--   1. accounting.expenses.driver_uuid becomes OPTIONAL — a general vendor expense has no driver.
--      (DROP NOT NULL only loosens; no index/unique on the column; backfill not needed.)
--   2. accounting.expense_lines gains expense_account_uuid — a DIRECT catalogs.accounts (GL) debit
--      account on the line, so the posting engine can debit the resolved CATEGORY account instead of
--      falling back to "Uncategorized". The existing line→category→metadata.account_id resolution is
--      preserved; the engine prefers the direct account only when set (see posting-engine.service.ts
--      buildExpenseLines). This is the line-level home for the form's resolved category account
--      (the form's category is a QBO account → resolved server-side to catalogs.accounts, entity-scoped).
--
-- Posting itself stays gated by EXPENSE_GL_POSTING_ENABLED (owner flag) — this migration changes NO
-- behavior on its own; it only makes the categorized cash-out representable. catalogs.accounts +
-- expense_lines already grant to ih35_app (0065 + DEFAULT PRIVILEGES); a new nullable column needs no
-- new grant. FK to catalogs.accounts(id) validates instantly (nullable column → zero-row check).
--
-- Reversible (manual down):
--   ALTER TABLE accounting.expense_lines DROP COLUMN IF EXISTS expense_account_uuid;
--   ALTER TABLE accounting.expenses ALTER COLUMN driver_uuid SET NOT NULL;  -- only if no NULLs exist
-- Forward-only. Idempotent.

BEGIN;

-- 1. Driver optional (general vendor expense has no driver).
ALTER TABLE accounting.expenses ALTER COLUMN driver_uuid DROP NOT NULL;

-- 2. Direct GL debit account on the expense line (the resolved category account).
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS expense_account_uuid uuid REFERENCES catalogs.accounts(id);

COMMIT;
