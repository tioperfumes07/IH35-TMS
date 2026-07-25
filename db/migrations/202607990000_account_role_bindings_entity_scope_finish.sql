-- 202607990000_account_role_bindings_entity_scope_finish.sql
--
-- HELD — DO NOT RUN ON PROD. Owner Neon-applies + ledger-backfills. Registered in .held-migrations.json.
--
-- LST-F09 / LST-RLS-01 — catalogs.account_role_bindings already carries operating_company_id (migration
-- 202607010700) and the global UNIQUE(role_key) is gone on prod, but:
--   * RLS is still ROLE-BASED (any authenticated SELECT; Owner/Admin write) — NOT company_scope GUC
--   * operating_company_id remains NULLABLE; per-entity unique is partial (WHERE opco IS NOT NULL)
--   * ih35_app still holds DELETE
--   * the writable CRUD route (account-role-bindings.routes.ts) never sets app.operating_company_id
--     and never writes operating_company_id — USMCA cannot bind its own control roles.
--
-- This migration finishes the schema side (additive). Route change ships in the same PR.
-- NEVER-DELETE (§F.24): no DROP TABLE/COLUMN; DROP POLICY IF EXISTS then recreate; DROP CONSTRAINT
-- only when replacing with a WIDER per-entity UNIQUE.
--
-- Dynamic org.companies — NO hardcoded UUID.

BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

DO $mig$
DECLARE
  v_primary uuid;
  v_nulls int;
BEGIN
  SELECT id INTO v_primary
    FROM org.companies
   WHERE deactivated_at IS NULL AND code = 'TRANSP'
   ORDER BY created_at, id
   LIMIT 1;
  IF v_primary IS NULL THEN
    SELECT id INTO v_primary
      FROM org.companies
     WHERE deactivated_at IS NULL
     ORDER BY created_at, id
     LIMIT 1;
  END IF;
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'account_role_bindings_entity_scope_finish: no active org.companies row';
  END IF;

  UPDATE catalogs.account_role_bindings
     SET operating_company_id = v_primary
   WHERE operating_company_id IS NULL;

  SELECT count(*) INTO v_nulls
    FROM catalogs.account_role_bindings
   WHERE operating_company_id IS NULL;
  IF v_nulls <> 0 THEN
    RAISE EXCEPTION 'account_role_bindings still has % NULL operating_company_id', v_nulls;
  END IF;

  ALTER TABLE catalogs.account_role_bindings
    ALTER COLUMN operating_company_id SET NOT NULL;

  -- Widen unique: drop partial unique index; add full UNIQUE(opco, role_key).
  DROP INDEX IF EXISTS catalogs.uq_account_role_bindings_company_role_key;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'catalogs.account_role_bindings'::regclass
       AND conname = 'account_role_bindings_opco_role_key'
  ) THEN
    ALTER TABLE catalogs.account_role_bindings
      ADD CONSTRAINT account_role_bindings_opco_role_key
      UNIQUE (operating_company_id, role_key);
  END IF;

  ALTER TABLE catalogs.account_role_bindings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.account_role_bindings FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS account_role_bindings_select ON catalogs.account_role_bindings;
  DROP POLICY IF EXISTS account_role_bindings_insert ON catalogs.account_role_bindings;
  DROP POLICY IF EXISTS account_role_bindings_update ON catalogs.account_role_bindings;
  DROP POLICY IF EXISTS company_scope ON catalogs.account_role_bindings;

  CREATE POLICY company_scope ON catalogs.account_role_bindings
    FOR ALL
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );

  REVOKE DELETE ON catalogs.account_role_bindings FROM ih35_app;
  GRANT SELECT, INSERT, UPDATE ON catalogs.account_role_bindings TO ih35_app;
END
$mig$;

COMMIT;
