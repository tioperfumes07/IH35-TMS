-- [HOLD-FOR-JORGE — TIER 1] Entity isolation for insurance schema.
--
-- Adds operating_company_id to all 8 insurance tables, backfills from the existing tenant_id where it
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

  -- 1. Add nullable operating_company_id to the 7 per-entity insurance tables.
  --    insurance.type_catalog is shared reference data (45 rows across all 3 entities) and is
  --    intentionally excluded from opco isolation; it gets a shared read policy below.
  FOREACH tbl IN ARRAY ARRAY[
    'insurance.claim',
    'insurance.coi_request',
    'insurance.lawsuit',
    'insurance.payment_schedule',
    'insurance.policy',
    'insurance.policy_unit',
    'insurance.refund_obligation'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS operating_company_id uuid', split_part(tbl, '.', 1), split_part(tbl, '.', 2));
  END LOOP;

  -- 2. Backfill operating_company_id from tenant_id only when it matches a real company.
  --    tenant_id is the pre-existing entity discriminator; we promote it to the canonical opco column.
  FOREACH tbl IN ARRAY ARRAY[
    'insurance.claim',
    'insurance.coi_request',
    'insurance.lawsuit',
    'insurance.payment_schedule',
    'insurance.policy',
    'insurance.policy_unit',
    'insurance.refund_obligation'
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

  RAISE NOTICE 'insurance_entity_isolation: backfilled % rows from tenant_id', total_backfilled;
END
$seed$;

-- 3. Replace tenant_id RLS policies with operating_company_id-scoped policies and ensure RLS is forced.
--    The lucia bypass allows GUARD/owner maintenance queries across entities.
ALTER TABLE insurance.claim ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_claim_tenant_scope ON insurance.claim;
DROP POLICY IF EXISTS insurance_claim_opco_scope ON insurance.claim;
CREATE POLICY insurance_claim_opco_scope ON insurance.claim
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE insurance.coi_request ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coi_request_tenant_scope ON insurance.coi_request;
DROP POLICY IF EXISTS coi_request_opco_scope ON insurance.coi_request;
CREATE POLICY coi_request_opco_scope ON insurance.coi_request
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE insurance.lawsuit ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_lawsuit_tenant_scope ON insurance.lawsuit;
DROP POLICY IF EXISTS insurance_lawsuit_opco_scope ON insurance.lawsuit;
CREATE POLICY insurance_lawsuit_opco_scope ON insurance.lawsuit
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE insurance.payment_schedule ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_schedule_tenant_scope ON insurance.payment_schedule;
DROP POLICY IF EXISTS payment_schedule_opco_scope ON insurance.payment_schedule;
CREATE POLICY payment_schedule_opco_scope ON insurance.payment_schedule
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE insurance.policy ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_policy_tenant_scope ON insurance.policy;
DROP POLICY IF EXISTS insurance_policy_opco_scope ON insurance.policy;
CREATE POLICY insurance_policy_opco_scope ON insurance.policy
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE insurance.policy_unit ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_policy_unit_tenant_scope ON insurance.policy_unit;
DROP POLICY IF EXISTS insurance_policy_unit_opco_scope ON insurance.policy_unit;
CREATE POLICY insurance_policy_unit_opco_scope ON insurance.policy_unit
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE insurance.refund_obligation ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refund_obligation_tenant_scope ON insurance.refund_obligation;
DROP POLICY IF EXISTS refund_obligation_opco_scope ON insurance.refund_obligation;
CREATE POLICY refund_obligation_opco_scope ON insurance.refund_obligation
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- Shared reference table: enable RLS with a read-all policy, but do NOT opco-isolate the rows.
-- The 45 reference rows are intentionally visible to all entities; writes remain restricted to
-- the table owner / maintenance bypass.
ALTER TABLE insurance.type_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_type_catalog_tenant_scope ON insurance.type_catalog;
DROP POLICY IF EXISTS insurance_type_catalog_shared_read ON insurance.type_catalog;
CREATE POLICY insurance_type_catalog_shared_read ON insurance.type_catalog
  FOR SELECT TO ih35_app
  USING (true);

COMMIT;
