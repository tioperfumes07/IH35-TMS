-- 202607890000_driver_termination_reasons_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. This migration runs ONLY on a Neon branch by the owner's hand, then is
-- ledger-backfilled so prod db:migrate skips it. catalogs.* schema change = owner-gated (financial
-- cluster). Registered in .held-migrations.json.
--
-- PER-ENTITY CONVERSION of catalogs.driver_termination_reasons (owner ruling 2026-07-24: "per entity,
-- same catalog for all entities"). 16 rows, 1 inbound FK from mdata.driver_safety_events.
--
--   * add operating_company_id (backfill existing -> primary company resolved DYNAMICALLY from
--     org.companies), COPY the primary's rows to every OTHER active company with fresh PKs,
--   * swap UNIQUE(code) -> UNIQUE(operating_company_id, code), FORCE RLS with the standard GUC
--     company_scope policy, REVOKE DELETE (void-not-delete).
--
-- Existing rows keep their PKs on the primary company, so mdata.driver_safety_events rows that FK a
-- termination_reason_id are undisturbed. The referencing safety-event handler resolves the DRIVER's
-- operating_company_id (mdata.drivers.operating_company_id) and sets the GUC before the catalog lookup,
-- so the reason validation resolves per entity (see driver-safety-events.routes.ts in the same PR).
--
-- IDEMPOTENT: IF NOT EXISTS / ON CONFLICT / catalog-of-constraints guards; safe to apply twice and on
-- the fresh-DB CI migrate from 0001.

DO $mig$
DECLARE
  v_primary uuid := COALESCE(
    (SELECT id FROM org.companies WHERE id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96' AND deactivated_at IS NULL),
    (SELECT id FROM org.companies WHERE deactivated_at IS NULL ORDER BY created_at, id LIMIT 1)
  );
  v_seed uuid;
BEGIN
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'driver_termination_reasons_per_entity: no active org.companies row to own the catalog';
  END IF;

  ALTER TABLE catalogs.driver_termination_reasons ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.driver_termination_reasons SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  ALTER TABLE catalogs.driver_termination_reasons ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_termination_reasons_opco_fk') THEN
    ALTER TABLE catalogs.driver_termination_reasons
      ADD CONSTRAINT driver_termination_reasons_opco_fk FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  ALTER TABLE catalogs.driver_termination_reasons DROP CONSTRAINT IF EXISTS driver_termination_reasons_code_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_termination_reasons_opco_code_key') THEN
    ALTER TABLE catalogs.driver_termination_reasons
      ADD CONSTRAINT driver_termination_reasons_opco_code_key UNIQUE (operating_company_id, code);
  END IF;

  FOR v_seed IN SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary LOOP
    INSERT INTO catalogs.driver_termination_reasons (operating_company_id, code, label, description, severity, is_active)
      SELECT v_seed, code, label, description, severity, is_active
      FROM catalogs.driver_termination_reasons
      WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, code) DO NOTHING;
  END LOOP;

  ALTER TABLE catalogs.driver_termination_reasons ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.driver_termination_reasons FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.driver_termination_reasons;
  CREATE POLICY company_scope ON catalogs.driver_termination_reasons
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));
END
$mig$;

REVOKE DELETE ON catalogs.driver_termination_reasons FROM ih35_app;
