-- [HOLD-FOR-JORGE — TIER 1] Entity isolation for factoring schema.
--
-- *** DO NOT RUN ON PROD without Jorge's explicit approval. Build-and-HOLD; owner applies on a Neon branch
-- and ledger-backfills so prod db:migrate skips it. ***
--
-- Adds operating_company_id to all 6 factoring tables, backfills from the existing tenant_id where it
-- resolves to a real org.companies row, then replaces tenant_id-scoped RLS policies with operating_company_id-
-- scoped policies and forces RLS. Rows whose entity is not derivable are LEFT NULL and are only visible
-- under identity.is_lucia_bypass(); owner classifies them later.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, backfill only touches NULL opco, DROP/CREATE POLICY, ENABLE/FORCE
-- are no-ops when already set. Apply-twice safe. Fresh-DB-from-0001 safe.

BEGIN;

DO $seed$
DECLARE
  tbl text;
  rows_updated bigint;
  total_backfilled bigint := 0;
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  -- 1. Add nullable operating_company_id to every factoring table.
  FOREACH tbl IN ARRAY ARRAY[
    'factoring.bank_match_suggestion',
    'factoring.batch',
    'factoring.customer_factor_assignment',
    'factoring.factor',
    'factoring.letter_of_release',
    'factoring.reserve_movement'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS operating_company_id uuid', split_part(tbl, '.', 1), split_part(tbl, '.', 2));
  END LOOP;

  -- 2. Backfill operating_company_id from tenant_id only when it matches a real company.
  FOREACH tbl IN ARRAY ARRAY[
    'factoring.bank_match_suggestion',
    'factoring.batch',
    'factoring.customer_factor_assignment',
    'factoring.factor',
    'factoring.letter_of_release',
    'factoring.reserve_movement'
  ]
  LOOP
    EXECUTE format(
      'UPDATE %I.%I t SET operating_company_id = c.id
         FROM org.companies c
        WHERE t.operating_company_id IS NULL
          AND t.tenant_id IS NOT NULL
          AND t.tenant_id = c.id',
      split_part(tbl, '.', 1), split_part(tbl, '.', 2)
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_backfilled := total_backfilled + rows_updated;
  END LOOP;

  RAISE NOTICE 'factoring_entity_isolation: backfilled % rows from tenant_id', total_backfilled;
END
$seed$;

-- 2b. Add FK from operating_company_id to org.companies(id) so every per-entity table satisfies the
--     TOTAL entity-isolation guard. The column is nullable; NULL rows remain valid.
DO $fks$
DECLARE
  tbl text;
  parts text[];
  con text;
  relid regclass;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'factoring.bank_match_suggestion',
    'factoring.batch',
    'factoring.customer_factor_assignment',
    'factoring.factor',
    'factoring.letter_of_release',
    'factoring.reserve_movement'
  ]
  LOOP
    parts := string_to_array(tbl, '.');
    con := parts[2] || '_operating_company_id_fk';
    relid := format('%I.%I', parts[1], parts[2])::regclass;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = con AND conrelid = relid
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (operating_company_id) REFERENCES org.companies(id)',
        parts[1], parts[2], con
      );
    END IF;
  END LOOP;
END
$fks$;

-- 3. Replace tenant_id RLS policies with operating_company_id-scoped policies and ensure RLS is forced.
ALTER TABLE factoring.bank_match_suggestion ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_bank_match_suggestion_tenant_scope ON factoring.bank_match_suggestion;
DROP POLICY IF EXISTS factoring_bank_match_suggestion_opco_scope ON factoring.bank_match_suggestion;
CREATE POLICY factoring_bank_match_suggestion_opco_scope ON factoring.bank_match_suggestion
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE factoring.batch ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_batch_tenant_scope ON factoring.batch;
DROP POLICY IF EXISTS factoring_batch_opco_scope ON factoring.batch;
CREATE POLICY factoring_batch_opco_scope ON factoring.batch
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE factoring.customer_factor_assignment ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_customer_factor_assignment_tenant_scope ON factoring.customer_factor_assignment;
DROP POLICY IF EXISTS factoring_customer_factor_assignment_opco_scope ON factoring.customer_factor_assignment;
CREATE POLICY factoring_customer_factor_assignment_opco_scope ON factoring.customer_factor_assignment
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE factoring.factor ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_factor_tenant_scope ON factoring.factor;
DROP POLICY IF EXISTS factoring_factor_opco_scope ON factoring.factor;
CREATE POLICY factoring_factor_opco_scope ON factoring.factor
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE factoring.letter_of_release ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_letter_of_release_tenant_scope ON factoring.letter_of_release;
DROP POLICY IF EXISTS factoring_letter_of_release_opco_scope ON factoring.letter_of_release;
CREATE POLICY factoring_letter_of_release_opco_scope ON factoring.letter_of_release
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE factoring.reserve_movement ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_reserve_movement_tenant_scope ON factoring.reserve_movement;
DROP POLICY IF EXISTS factoring_reserve_movement_opco_scope ON factoring.reserve_movement;
CREATE POLICY factoring_reserve_movement_opco_scope ON factoring.reserve_movement
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

COMMIT;
