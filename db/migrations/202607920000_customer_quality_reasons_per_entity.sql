-- 202607920000_customer_quality_reasons_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. This migration runs ONLY on a Neon branch by the owner's hand, then is
-- ledger-backfilled so prod db:migrate skips it. catalogs.* schema change = owner-gated (financial
-- cluster). Registered in .held-migrations.json.
--
-- PER-ENTITY CONVERSION of catalogs.customer_quality_event_reasons (owner ruling 2026-07-24: "per
-- entity, same catalog for all entities"). 24 rows, 1 inbound FK from mdata.customer_quality_events.
-- Companion to 202607890000 (driver_termination_reasons) — same shape; the referencing quality-event
-- handlers resolve the CUSTOMER's operating_company_id (mdata.customers.operating_company_id) and set
-- the GUC before the reason lookup/JOIN (see customer-quality-events.routes.ts in the same PR).
--
--   * add operating_company_id (backfill existing -> primary company resolved DYNAMICALLY from
--     org.companies), COPY the primary's rows to every OTHER active company with fresh PKs (carrying
--     the NOT NULL event_type + severity, and deactivated_at so a copied deactivated row stays proper),
--   * swap UNIQUE(code) -> UNIQUE(operating_company_id, code), FORCE RLS company_scope policy, REVOKE DELETE.
--
-- Existing rows keep their PKs on the primary company, so mdata.customer_quality_events FK rows are
-- undisturbed. IDEMPOTENT (IF NOT EXISTS / ON CONFLICT / catalog-of-constraints guards); safe apply-twice
-- and on the fresh-DB CI migrate from 0001.

DO $mig$
DECLARE
  v_primary uuid := COALESCE(
    (SELECT id FROM org.companies WHERE id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96' AND deactivated_at IS NULL),
    (SELECT id FROM org.companies WHERE deactivated_at IS NULL ORDER BY created_at, id LIMIT 1)
  );
  v_seed uuid;
BEGIN
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'customer_quality_reasons_per_entity: no active org.companies row to own the catalog';
  END IF;

  ALTER TABLE catalogs.customer_quality_event_reasons ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.customer_quality_event_reasons SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  ALTER TABLE catalogs.customer_quality_event_reasons ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_quality_event_reasons_opco_fk') THEN
    ALTER TABLE catalogs.customer_quality_event_reasons
      ADD CONSTRAINT customer_quality_event_reasons_opco_fk FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  ALTER TABLE catalogs.customer_quality_event_reasons DROP CONSTRAINT IF EXISTS customer_quality_event_reasons_code_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_quality_event_reasons_opco_code_key') THEN
    ALTER TABLE catalogs.customer_quality_event_reasons
      ADD CONSTRAINT customer_quality_event_reasons_opco_code_key UNIQUE (operating_company_id, code);
  END IF;

  FOR v_seed IN SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary LOOP
    -- Carry event_type/severity (NOT NULL) + deactivated_at (so a copied deactivated row stays proper).
    INSERT INTO catalogs.customer_quality_event_reasons
      (operating_company_id, code, label, description, event_type, severity, is_active, deactivated_at)
      SELECT v_seed, code, label, description, event_type, severity, is_active, deactivated_at
      FROM catalogs.customer_quality_event_reasons
      WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, code) DO NOTHING;
  END LOOP;

  ALTER TABLE catalogs.customer_quality_event_reasons ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.customer_quality_event_reasons FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.customer_quality_event_reasons;
  CREATE POLICY company_scope ON catalogs.customer_quality_event_reasons
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));
END
$mig$;

REVOKE DELETE ON catalogs.customer_quality_event_reasons FROM ih35_app;
