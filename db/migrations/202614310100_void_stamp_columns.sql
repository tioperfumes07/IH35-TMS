-- 202614310100_void_stamp_columns.sql
--
-- R-102.1-A (Lead, deadline 2026-09-23 18:00 UTC). Owner's standing ruling: "FOR FUTURE
-- REFERENCE YES AL SHOULD STATE VOIDED." A soft delete is not a void. archived_at is not a void.
-- status<>'voided' alone carries no actor and no reason, so nothing audits back to a person.
--
-- Measured live, 2026-09-23, br-fancy-credit-akjnd07a, SET LOCAL app.bypass_rls='lucia':
-- information_schema.columns returned ZERO of voided_at / void_reason / voided_by_user_id on
-- mdata.loads (carries only soft_deleted_at, status), accounting.factoring_advances (status
-- only), and fuel.fuel_transactions (archived_at only, no status column at all).
-- driver_finance.driver_reimbursements already carries voided_at and void_reason but is missing
-- voided_by_user_id. accounting.invoices carries all three -- this migration copies its exact
-- shape (column types, nullability, the same FK target, the same partial-index predicate) onto
-- the four gaps; it does not invent a variant.
--
-- mdata.loads.status is a real Postgres enum (load_status_enum) with no 'voided' member as of
-- this migration -- 202614310000, its OWN, separate, DDL-free file, adds it (see that file's
-- header for why the enum addition cannot safely share a transaction with any other DDL). This
-- migration adds no enum value and does not depend on 202614310000 having landed to apply
-- cleanly (ADD COLUMN never touches the enum type) -- but stampDocumentVoided() cannot
-- successfully write status='voided' on a loads row until 202614310000 has landed too. Both are
-- required together for loads; this file alone is enough for the other three families.
--
-- FORCED RLS unchanged: these are additive nullable columns on tables whose RLS policies already
-- exist and do not enumerate a column list. WORM triggers unchanged: this migration adds columns,
-- never a delete path -- trg_worm_refuse_delete and the hard append-only triggers (neither of
-- which apply to these four tables) are untouched by an ADD COLUMN.
--
-- ih35_app GRANTs CONFIRMED, not re-granted: Postgres privileges here are table-level, not
-- column-level. A live check before this migration (information_schema.role_table_grants,
-- grantee='ih35_app') already showed INSERT/SELECT/UPDATE on all four target tables (plus DELETE
-- on mdata.loads, pre-existing and unrelated). Adding a column to a table ih35_app can already
-- UPDATE does not require a new GRANT statement.
DO $$
BEGIN
  -- ============================================================================================
  -- mdata.loads
  -- ============================================================================================
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='loads' AND column_name='voided_at'
    ) THEN
      ALTER TABLE mdata.loads ADD COLUMN voided_at timestamptz;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='loads' AND column_name='void_reason'
    ) THEN
      ALTER TABLE mdata.loads ADD COLUMN void_reason text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='loads' AND column_name='voided_by_user_id'
    ) THEN
      ALTER TABLE mdata.loads ADD COLUMN voided_by_user_id uuid;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'loads_voided_by_user_id_fkey'
    ) THEN
      ALTER TABLE mdata.loads
        ADD CONSTRAINT loads_voided_by_user_id_fkey FOREIGN KEY (voided_by_user_id) REFERENCES identity.users(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='mdata' AND tablename='loads' AND indexname='idx_loads_voided_at'
    ) THEN
      CREATE INDEX idx_loads_voided_at ON mdata.loads (voided_at) WHERE voided_at IS NOT NULL;
    END IF;
  END IF;

  -- ============================================================================================
  -- accounting.factoring_advances
  -- ============================================================================================
  IF to_regclass('accounting.factoring_advances') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='accounting' AND table_name='factoring_advances' AND column_name='voided_at'
    ) THEN
      ALTER TABLE accounting.factoring_advances ADD COLUMN voided_at timestamptz;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='accounting' AND table_name='factoring_advances' AND column_name='void_reason'
    ) THEN
      ALTER TABLE accounting.factoring_advances ADD COLUMN void_reason text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='accounting' AND table_name='factoring_advances' AND column_name='voided_by_user_id'
    ) THEN
      ALTER TABLE accounting.factoring_advances ADD COLUMN voided_by_user_id uuid;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'factoring_advances_voided_by_user_id_fkey'
    ) THEN
      ALTER TABLE accounting.factoring_advances
        ADD CONSTRAINT factoring_advances_voided_by_user_id_fkey FOREIGN KEY (voided_by_user_id) REFERENCES identity.users(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='accounting' AND tablename='factoring_advances' AND indexname='idx_factoring_advances_voided_at'
    ) THEN
      CREATE INDEX idx_factoring_advances_voided_at ON accounting.factoring_advances (voided_at) WHERE voided_at IS NOT NULL;
    END IF;
  END IF;

  -- ============================================================================================
  -- fuel.fuel_transactions
  -- ============================================================================================
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='fuel' AND table_name='fuel_transactions' AND column_name='voided_at'
    ) THEN
      ALTER TABLE fuel.fuel_transactions ADD COLUMN voided_at timestamptz;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='fuel' AND table_name='fuel_transactions' AND column_name='void_reason'
    ) THEN
      ALTER TABLE fuel.fuel_transactions ADD COLUMN void_reason text;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='fuel' AND table_name='fuel_transactions' AND column_name='voided_by_user_id'
    ) THEN
      ALTER TABLE fuel.fuel_transactions ADD COLUMN voided_by_user_id uuid;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fuel_transactions_voided_by_user_id_fkey'
    ) THEN
      ALTER TABLE fuel.fuel_transactions
        ADD CONSTRAINT fuel_transactions_voided_by_user_id_fkey FOREIGN KEY (voided_by_user_id) REFERENCES identity.users(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='fuel' AND tablename='fuel_transactions' AND indexname='idx_fuel_transactions_voided_at'
    ) THEN
      CREATE INDEX idx_fuel_transactions_voided_at ON fuel.fuel_transactions (voided_at) WHERE voided_at IS NOT NULL;
    END IF;
  END IF;

  -- ============================================================================================
  -- driver_finance.driver_reimbursements -- only voided_by_user_id is missing; voided_at and
  -- void_reason already exist live. Adding the FK + index unconditionally is still correct even
  -- though the base columns predate this migration.
  -- ============================================================================================
  IF to_regclass('driver_finance.driver_reimbursements') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='driver_finance' AND table_name='driver_reimbursements' AND column_name='voided_by_user_id'
    ) THEN
      ALTER TABLE driver_finance.driver_reimbursements ADD COLUMN voided_by_user_id uuid;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'driver_reimbursements_voided_by_user_id_fkey'
    ) THEN
      ALTER TABLE driver_finance.driver_reimbursements
        ADD CONSTRAINT driver_reimbursements_voided_by_user_id_fkey FOREIGN KEY (voided_by_user_id) REFERENCES identity.users(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='driver_finance' AND tablename='driver_reimbursements' AND indexname='idx_driver_reimbursements_voided_at'
    ) THEN
      CREATE INDEX idx_driver_reimbursements_voided_at ON driver_finance.driver_reimbursements (voided_at) WHERE voided_at IS NOT NULL;
    END IF;
  END IF;
END $$;
