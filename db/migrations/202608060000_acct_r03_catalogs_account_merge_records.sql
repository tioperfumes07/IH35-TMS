-- 202608060000_acct_r03_catalogs_account_merge_records.sql
--
-- HELD — DO NOT RUN ON PROD. Owner Neon-applies + ledger-backfills. Registered in .held-migrations.json.
-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] ACCT-R-03 (ranked ACCT-F13) / pile 0091-m-lists-2.
--
-- ROOT CAUSE this table exists for: the Chart-of-Accounts "Merge accounts" action
-- (apps/frontend/src/pages/lists/accounting/CoaBatchActions.tsx handleMerge) only called the catalog
-- DEACTIVATE endpoint on each source account. Nothing reparented the source's child accounts, nothing
-- remounted the config pointers (catalogs.items default_income/expense_account_id,
-- catalogs.account_role_bindings, accounting.chart_of_accounts_roles,
-- accounting.expense_category_account_map), and nothing recorded that a merge ever happened. The chart
-- was left with orphaned children and config still designating an archived account.
--
-- Blueprint MUST 3.18.4.3 step 5 requires an append-only merge record linking source → target with
-- timestamp, user and reason. That table does not exist anywhere in db/migrations (grep
-- account_merge_record → 0 hits before this file), so the merge service has nothing to write.
--
-- WHAT THIS MIGRATION DOES (additive only):
--   * CREATE TABLE catalogs.account_merge_records — append-only merge ledger
--   * SAME-ENTITY composite FKs (operating_company_id, source/target_account_id) -> catalogs.accounts
--     (operating_company_id, id). A single-column FK would let a merge record bind two accounts owned
--     by DIFFERENT entities — the cross-entity leak class ACCT-LINK-04 / BANK-LINK-01 already closed.
--   * CHECK source <> target; CHECK char_length(reason) >= 20 (blueprint 3.18.9 validation payload)
--   * FORCE RLS + company_scope policy (GUC + identity.is_lucia_bypass()) — mirrors 202608010000
--   * REVOKE DELETE **and UPDATE** from ih35_app — append-only, void-not-delete (§F.24)
--
-- POSTS NOTHING. No journal entry, no GL account, no posting flag, no feature flag, no GL math.
-- Historical journal postings are NOT touched by this migration and, per MUST 3.18.7.1
-- ("the system MUST NOT migrate historical postings to new accounts; history is immutable"), the
-- companion service REFUSES migrate_historical_postings=true with E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN
-- rather than silently rewriting posted history.
--
-- Dynamic org.companies / catalogs.accounts — NO hardcoded UUID literal, seeds no rows.
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS / pg_constraint IF NOT EXISTS / DROP POLICY IF EXISTS.
-- Apply-twice safe; validated on a throwaway Postgres, never on prod by db:migrate.

DO $mig$
BEGIN
  -- catalogs.accounts already carries UNIQUE (operating_company_id, id) from 202606300080 (af2).
  -- Re-assert idempotently so this migration is self-contained on a fresh database.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_accounts_company_id' AND conrelid = 'catalogs.accounts'::regclass
  ) THEN
    ALTER TABLE catalogs.accounts ADD CONSTRAINT uq_accounts_company_id UNIQUE (operating_company_id, id);
  END IF;

  CREATE TABLE IF NOT EXISTS catalogs.account_merge_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id uuid NOT NULL REFERENCES org.companies(id),
    source_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
    target_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
    reason text NOT NULL,
    -- Blueprint MUST 3.18.4.3 step 3 / MUST 3.18.7.1: history stays on the source. Persisted so the
    -- record is honest about which policy produced it if the owner ever unlocks migration.
    migrate_historical_postings boolean NOT NULL DEFAULT false,
    -- What the merge actually re-pointed, so the record is auditable without replaying the code.
    reparented_child_account_count integer NOT NULL DEFAULT 0,
    remounted_reference_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_account_number text,
    source_account_name text,
    target_account_number text,
    target_account_name text,
    account_type text NOT NULL,
    merged_at timestamptz NOT NULL DEFAULT now(),
    merged_by_user_id uuid NOT NULL REFERENCES identity.users(id)
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_merge_records_source_ne_target_chk'
  ) THEN
    ALTER TABLE catalogs.account_merge_records
      ADD CONSTRAINT account_merge_records_source_ne_target_chk CHECK (source_account_id <> target_account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_merge_records_reason_len_chk'
  ) THEN
    ALTER TABLE catalogs.account_merge_records
      ADD CONSTRAINT account_merge_records_reason_len_chk CHECK (char_length(btrim(reason)) >= 20);
  END IF;

  -- SAME-ENTITY composite FKs: a merge may never bind two entities' charts together.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_merge_records_source_same_entity_fkey'
  ) THEN
    ALTER TABLE catalogs.account_merge_records
      ADD CONSTRAINT account_merge_records_source_same_entity_fkey
      FOREIGN KEY (operating_company_id, source_account_id)
      REFERENCES catalogs.accounts (operating_company_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_merge_records_target_same_entity_fkey'
  ) THEN
    ALTER TABLE catalogs.account_merge_records
      ADD CONSTRAINT account_merge_records_target_same_entity_fkey
      FOREIGN KEY (operating_company_id, target_account_id)
      REFERENCES catalogs.accounts (operating_company_id, id);
  END IF;

  CREATE INDEX IF NOT EXISTS idx_account_merge_records_source
    ON catalogs.account_merge_records (operating_company_id, source_account_id);
  CREATE INDEX IF NOT EXISTS idx_account_merge_records_target
    ON catalogs.account_merge_records (operating_company_id, target_account_id);

  ALTER TABLE catalogs.account_merge_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.account_merge_records FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS company_scope ON catalogs.account_merge_records;
  CREATE POLICY company_scope ON catalogs.account_merge_records
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));
END
$mig$;

GRANT SELECT, INSERT ON catalogs.account_merge_records TO ih35_app;
-- Append-only ledger: a merge record is evidence and may never be edited or removed (§F.24).
REVOKE UPDATE, DELETE ON catalogs.account_merge_records FROM ih35_app;
