-- [HOLD-FOR-JORGE — TIER 1] Per-entity bank-account HIDE/EXCLUDE.
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. DO NOT flip BANK_ACCOUNT_HIDE_ENABLED. Flag DEFAULT OFF,
--     per-entity-only (no global enable is possible — see code registration in
--     apps/backend/src/lib/feature-flags/service.ts PER_ENTITY_ONLY_FLAG_KEYS). Run ONLY on a Neon
--     branch by Jorge's hand, then ledger-backfill so prod db:migrate skips it. ***
--
-- WHY (Jorge): TRANSP and TRK share ONE Wells Fargo/Plaid login, so Plaid pulls ALL 4 WF accounts
-- (3 TRANSP + 1 TRK) into BOTH entities' banking.bank_accounts (each row already carries its OWN
-- operating_company_id per the 0072 RLS design — this is a real per-entity DUPLICATE ingestion, not
-- a single shared row). Each entity must be able to COMPLETELY HIDE the other entity's duplicate rows
-- so they never affect that entity's ledger, CoA, balance sheet, categorization, reconciliation, or
-- cash flow. Design doc: docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md (lists every read path
-- the backend now filters).
--
-- WHAT (no new GL math, no new table — reuses the existing per-row entity scoping):
--   §1 feature flag BANK_ACCOUNT_HIDE_ENABLED — lib.feature_flags, default_enabled=false. Registered
--      per-entity-only in code (never a global on-switch).
--   §2 banking.bank_accounts gets 3 new nullable columns: hidden_at / hidden_by_user_id / hidden_reason.
--      NULL (the default) = visible, unchanged behavior. Non-NULL = hidden FOR THAT ROW'S OWNING
--      ENTITY ONLY (RLS already scopes the row to one operating_company_id, so hiding one entity's
--      duplicate row can never affect the other entity's own row for the "same" real-world account).
--      void-not-delete: hide/unhide only ever SETS/CLEARS these columns — never DELETEs the row.
--   §3 partial index for the hidden-accounts admin list.
--   §4 self-contained GRANTs (idempotent re-assert).
--
-- NOTE ON A PRE-EXISTING, UNRELATED MECHANISM: banking.bank_accounts already has a `visible` /
-- `tag` / `is_dip` set of columns referenced by POST /api/v1/banking/accounts/visibility — that is a
-- DASHBOARD-TILE display/ordering toggle from the pre-migrations-era schema (its columns do not exist
-- in the from-migrations schema at all — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md and
-- form-425c.routes.ts's own note that is_dip/tag are "phantom"). It is NOT an exclusion mechanism and
-- is left untouched here — hidden_at is a NEW, distinct, ledger-affecting exclusion flag.
--
-- FRESH-DB SAFE: banking.bank_accounts is created by 0072 before this runs; ADD COLUMN IF NOT EXISTS
-- is a no-op if already applied. Idempotent throughout.

BEGIN;

-- ===========================================================================================
-- §1 — Feature flag (per-entity kill switch), DEFAULT OFF. Read at runtime via
--      isEnabled(client, 'BANK_ACCOUNT_HIDE_ENABLED', {operating_company_id}). NO global env read.
-- ===========================================================================================
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'BANK_ACCOUNT_HIDE_ENABLED',
  'Per-entity bank-account hide/exclude: when ON for an operating company, any banking.bank_accounts row with hidden_at set is fully excluded from that entity''s ledger, CoA, balance sheet, cash-flow, categorization, and reconciliation reads. Per-entity override (TRANSP/TRK/USMCA) only — default OFF until Jorge verifies on a Neon branch.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

-- ===========================================================================================
-- §2 — hide/unhide columns on banking.bank_accounts. NULL = visible (default, unchanged behavior).
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NOT NULL THEN
    ALTER TABLE banking.bank_accounts
      ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
      ADD COLUMN IF NOT EXISTS hidden_by_user_id uuid,
      ADD COLUMN IF NOT EXISTS hidden_reason text;
  END IF;
END $$;

-- ===========================================================================================
-- §3 — partial index for the "hidden accounts" admin list (small population; not on the hot path).
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_hidden
      ON banking.bank_accounts (operating_company_id, hidden_at)
      WHERE hidden_at IS NOT NULL;
  END IF;
END $$;

-- ===========================================================================================
-- §4 — self-contained GRANTs (Standing Order #16) — re-assert idempotently; no privilege change
--      needed (SELECT/INSERT/UPDATE on banking.bank_accounts already granted by 0072 /
--      202606280100), but asserted here so this migration is self-sufficient in isolation.
-- ===========================================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app')
     AND to_regclass('banking.bank_accounts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON banking.bank_accounts TO ih35_app;
  END IF;
END $$;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='banking' AND table_name='bank_accounts'
--     AND column_name IN ('hidden_at','hidden_by_user_id','hidden_reason');
--   -- expect all 3 rows.
--   SELECT flag_key, default_enabled FROM lib.feature_flags WHERE flag_key = 'BANK_ACCOUNT_HIDE_ENABLED';
--   -- expect default_enabled = false.
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   BEGIN;
--     ALTER TABLE banking.bank_accounts DROP COLUMN IF EXISTS hidden_at, DROP COLUMN IF EXISTS hidden_by_user_id, DROP COLUMN IF EXISTS hidden_reason;
--     DROP INDEX IF EXISTS banking.idx_bank_accounts_hidden;
--     DELETE FROM lib.feature_flags WHERE flag_key='BANK_ACCOUNT_HIDE_ENABLED';
--   COMMIT;
