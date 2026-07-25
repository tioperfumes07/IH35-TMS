-- 202608010000_dispatcher_error_reasons_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. Owner Neon-apply + ledger-backfill only. Registered in .held-migrations.json.
--
-- LST-CAT-06 — PER-ENTITY CONVERSION of catalogs.dispatcher_error_reasons (owner ruling 2026-07-24:
-- "per entity, same catalog for all entities" + load-derived entity for referencing handlers).
-- Prod (br-fancy-credit-akjnd07a, lucia): 25 rows, NO operating_company_id; FORCE RLS true but
-- policies are role-only (der_select_owner_admin / der_modify_owner_only) — entity-blind.
-- Inbound FK usage: mdata.dispatcher_safety_events.error_reason_id = 0 live rows (safe PK keep).
--
--   * add operating_company_id (backfill existing -> TRANSP by code, else oldest active company)
--   * COPY primary rows to every OTHER active company (fresh PKs, same values)
--   * UNIQUE(code) -> UNIQUE(operating_company_id, code)
--   * DROP role-only policies; CREATE company_scope (GUC + lucia bypass)
--   * REVOKE DELETE (void-not-delete)
--
-- Companion route: dispatcher-safety-events.routes.ts sets GUC from related load (preferred),
-- else driver/customer, else caller — never UNION…ORDER BY id LIMIT 1.
--
-- IDEMPOTENT: IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS; apply-twice safe.

DO $mig$
DECLARE
  v_primary uuid := COALESCE(
    (SELECT id FROM org.companies WHERE code = 'TRANSP' AND deactivated_at IS NULL LIMIT 1),
    (SELECT id FROM org.companies WHERE deactivated_at IS NULL ORDER BY created_at, id LIMIT 1)
  );
  v_seed uuid;
BEGIN
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'dispatcher_error_reasons_per_entity: no active org.companies row to own the catalog';
  END IF;

  ALTER TABLE catalogs.dispatcher_error_reasons ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.dispatcher_error_reasons SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  ALTER TABLE catalogs.dispatcher_error_reasons ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_error_reasons_opco_fk') THEN
    ALTER TABLE catalogs.dispatcher_error_reasons
      ADD CONSTRAINT dispatcher_error_reasons_opco_fk FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  ALTER TABLE catalogs.dispatcher_error_reasons DROP CONSTRAINT IF EXISTS dispatcher_error_reasons_code_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_error_reasons_opco_code_key') THEN
    ALTER TABLE catalogs.dispatcher_error_reasons
      ADD CONSTRAINT dispatcher_error_reasons_opco_code_key UNIQUE (operating_company_id, code);
  END IF;

  FOR v_seed IN SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary LOOP
    INSERT INTO catalogs.dispatcher_error_reasons (
      operating_company_id, code, label, description, event_type, severity, is_active, deactivated_at
    )
      SELECT v_seed, code, label, description, event_type, severity, is_active, deactivated_at
      FROM catalogs.dispatcher_error_reasons
      WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, code) DO NOTHING;
  END LOOP;

  ALTER TABLE catalogs.dispatcher_error_reasons ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.dispatcher_error_reasons FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS der_select_owner_admin ON catalogs.dispatcher_error_reasons;
  DROP POLICY IF EXISTS der_modify_owner_only ON catalogs.dispatcher_error_reasons;
  DROP POLICY IF EXISTS company_scope ON catalogs.dispatcher_error_reasons;
  CREATE POLICY company_scope ON catalogs.dispatcher_error_reasons
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));
END
$mig$;

REVOKE DELETE ON catalogs.dispatcher_error_reasons FROM ih35_app;
