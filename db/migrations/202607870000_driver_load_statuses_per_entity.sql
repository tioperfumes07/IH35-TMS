-- 202607870000_driver_load_statuses_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. This migration runs ONLY on a Neon branch by the owner's hand, then is
-- ledger-backfilled so prod db:migrate skips it. catalogs.* schema change = owner-gated (financial
-- cluster). Registered in .held-migrations.json.
--
-- PER-ENTITY CONVERSION of catalogs.driver_load_statuses (owner ruling 2026-07-24: "lists and
-- catalogs should be per entity, but we use the same catalog for all entities"). Companion to
-- 202607860000 (the 8 fleet/asset catalogs); same shape, one table.
--
--   * add operating_company_id (backfill existing rows -> primary company, resolved DYNAMICALLY from
--     org.companies so the FK holds on a fresh-from-0001 CI DB too — never a hardcoded UUID),
--   * COPY the primary company's rows to every OTHER active company with fresh PKs (same values),
--   * swap UNIQUE(code) -> UNIQUE(operating_company_id, code),
--   * ENABLE + FORCE RLS with the standard GUC company_scope policy (matches catalogs.load_types),
--   * REVOKE DELETE (void-not-delete).
--
-- driver_load_statuses already carries created_by_user_id/updated_by_user_id (no audit-column
-- harmonization needed) and has ZERO inbound FKs (verified Neon br-fancy-credit-akjnd07a 2026-07-24),
-- so existing rows keep their PKs on the primary company and nothing referencing them moves.
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
    RAISE EXCEPTION 'driver_load_statuses_per_entity: no active org.companies row to own the catalog';
  END IF;

  -- 1) STRUCTURE.
  ALTER TABLE catalogs.driver_load_statuses ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.driver_load_statuses SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  ALTER TABLE catalogs.driver_load_statuses ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_load_statuses_opco_fk') THEN
    ALTER TABLE catalogs.driver_load_statuses
      ADD CONSTRAINT driver_load_statuses_opco_fk FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  ALTER TABLE catalogs.driver_load_statuses DROP CONSTRAINT IF EXISTS driver_load_statuses_code_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_load_statuses_opco_code_key') THEN
    ALTER TABLE catalogs.driver_load_statuses
      ADD CONSTRAINT driver_load_statuses_opco_code_key UNIQUE (operating_company_id, code);
  END IF;

  -- 2) SEED: copy the primary company's catalog to every OTHER active company (same values, fresh PKs).
  --    `phase` is NOT NULL and must be carried. v_seed iterates real org.companies rows only (FK-safe).
  FOR v_seed IN SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary LOOP
    INSERT INTO catalogs.driver_load_statuses (operating_company_id, code, name, description, phase, sort_order, is_active)
      SELECT v_seed, code, name, description, phase, sort_order, is_active
      FROM catalogs.driver_load_statuses
      WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, code) DO NOTHING;
  END LOOP;

  -- 3) RLS: ENABLE + FORCE + standard GUC company_scope policy (identical to catalogs.load_types).
  ALTER TABLE catalogs.driver_load_statuses ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.driver_load_statuses FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.driver_load_statuses;
  CREATE POLICY company_scope ON catalogs.driver_load_statuses
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));
END
$mig$;

-- VOID-NOT-DELETE hardening: reference catalog with soft-delete (deactivated_at / is_active); the
-- route never issues DELETE. Revoke it so a stray hard-delete can't erase a status another record
-- points at. (KEEP the arw default; only DELETE is removed.)
REVOKE DELETE ON catalogs.driver_load_statuses FROM ih35_app;
