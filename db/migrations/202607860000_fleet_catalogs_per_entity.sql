-- 202607860000_fleet_catalogs_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. This migration runs ONLY on a Neon branch by the owner's hand, then is
-- ledger-backfilled so prod db:migrate skips it. catalogs.* schema change = owner-gated (financial
-- cluster). Registered in .held-migrations.json.
--
-- PER-ENTITY CONVERSION of 8 fleet/asset reference catalogs.
--
-- OWNER RULING 2026-07-24: "lists and catalogs should be per entity, but we use the same
-- catalog for all entities." Model = each entity OWNS its own catalog rows (so USMCA/TRK can
-- diverge later if ever needed), but IH35 seeds IDENTICAL values to every entity today.
--
-- These 8 catalogs were GLOBAL (no operating_company_id). This migration makes them per-entity,
-- matching the already-per-entity dispatch catalogs (catalogs.load_types et al.):
--   * add operating_company_id (backfill existing rows -> TRANSP so no existing reference moves),
--   * COPY the TRANSP rows to USMCA + TRK with fresh PKs (same values -> "same catalog for all"),
--   * swap the single-column UNIQUE(code) for UNIQUE(operating_company_id, code),
--   * ENABLE + FORCE RLS with the standard GUC company_scope policy the app's set_config feeds.
--
-- Also HARMONIZES the 4 tables that lacked created_by_user_id / updated_by_user_id
-- (asset_condition_codes, tractor_statuses, trailer_statuses, unit_ownership_types). The shared
-- fleet catalog factory's POST writes those two columns unconditionally, so CREATE on those 4
-- catalogs 500s today (undefined_column) -- which is why all 4 sit at 0 rows on prod. Adding the
-- columns fixes that latent create-500 in the same change that makes the factory scope by entity.
--
-- SAFE FOR INBOUND FKs: the 6 sibling catalogs that other tables FK to are NOT in this batch;
-- these 8 have zero inbound FKs (verified on prod 2026-07-24), and existing rows keep their PKs on
-- TRANSP, so nothing that references a catalog row is disturbed.
--
-- IDEMPOTENT: IF NOT EXISTS / ON CONFLICT / catalog-of-constraints guards throughout, so a re-run
-- (and the fresh-DB CI migrate from 0001) is a no-op after the first apply.
--
-- HELD — DO NOT RUN ON PROD. catalogs.* schema change = owner-gated (financial cluster).
-- Registered in .held-migrations.json; the deploy runner HELD-SKIPs it. This migration runs ONLY
-- on a Neon branch by the owner's hand, then is ledger-backfilled so prod db:migrate skips it.

DO $mig$
DECLARE
  v_transp uuid := '91e0bf0a-133f-4ce8-a734-2586cfa66d96';  -- IH 35 Transportation (operating)
  v_usmca  uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';  -- USMCA Freight (operating)
  v_trk    uuid := 'b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e';  -- IH 35 Trucking (asset holder)
  v_tbl    text;
  v_seed   uuid;
  v_tables text[] := ARRAY[
    'asset_condition_codes','asset_locations','asset_statuses','unit_ownership_types',
    'trailer_types','lease_terms','tractor_statuses','trailer_statuses'
  ];
BEGIN
  -- 1) STRUCTURE: audit columns (4 tables lack them) + operating_company_id, then scope keys.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    -- Harmonize audit columns (nullable, matching the 4 tables that already have them).
    EXECUTE format('ALTER TABLE catalogs.%I ADD COLUMN IF NOT EXISTS created_by_user_id uuid', v_tbl);
    EXECUTE format('ALTER TABLE catalogs.%I ADD COLUMN IF NOT EXISTS updated_by_user_id uuid', v_tbl);

    -- Add the entity column, backfill existing (global) rows to TRANSP, then lock NOT NULL.
    EXECUTE format('ALTER TABLE catalogs.%I ADD COLUMN IF NOT EXISTS operating_company_id uuid', v_tbl);
    EXECUTE format('UPDATE catalogs.%I SET operating_company_id = $1 WHERE operating_company_id IS NULL', v_tbl)
      USING v_transp;
    EXECUTE format('ALTER TABLE catalogs.%I ALTER COLUMN operating_company_id SET NOT NULL', v_tbl);

    -- FK to org.companies (idempotent).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_tbl || '_opco_fk') THEN
      EXECUTE format(
        'ALTER TABLE catalogs.%I ADD CONSTRAINT %I FOREIGN KEY (operating_company_id) REFERENCES org.companies(id)',
        v_tbl, v_tbl || '_opco_fk');
    END IF;

    -- Swap single-column UNIQUE(code) for UNIQUE(operating_company_id, code). The old key name is
    -- <tbl>_code_key on every one of these 8 (verified on prod); drop-if-exists is a no-op otherwise.
    EXECUTE format('ALTER TABLE catalogs.%I DROP CONSTRAINT IF EXISTS %I', v_tbl, v_tbl || '_code_key');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_tbl || '_opco_code_key') THEN
      EXECUTE format(
        'ALTER TABLE catalogs.%I ADD CONSTRAINT %I UNIQUE (operating_company_id, code)',
        v_tbl, v_tbl || '_opco_code_key');
    END IF;
  END LOOP;

  -- 2) SEED: copy the TRANSP catalog to USMCA + TRK, same values, fresh PKs ("same catalog for all
  --    entities"). Guarded by org.companies existence so a DB missing an entity row cannot FK-fail.
  --    ON CONFLICT keeps this a no-op on re-run and on any code already present for that entity.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    FOREACH v_seed IN ARRAY ARRAY[v_usmca, v_trk] LOOP
      IF EXISTS (SELECT 1 FROM org.companies WHERE id = v_seed) THEN
        EXECUTE format(
          'INSERT INTO catalogs.%I (operating_company_id, code, name, description, sort_order, is_active)
             SELECT $1, code, name, description, sort_order, is_active
             FROM catalogs.%I
             WHERE operating_company_id = $2
           ON CONFLICT (operating_company_id, code) DO NOTHING',
          v_tbl, v_tbl) USING v_seed, v_transp;
      END IF;
    END LOOP;
  END LOOP;

  -- 3) RLS: ENABLE + FORCE + the standard GUC company_scope policy (identical shape to
  --    catalogs.load_types). is_lucia_bypass() arm lets migration/seed + bypass readers through.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', v_tbl);
    EXECUTE format('ALTER TABLE catalogs.%I FORCE ROW LEVEL SECURITY', v_tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', v_tbl);
    EXECUTE format(
      'CREATE POLICY company_scope ON catalogs.%I
         FOR ALL
         USING (identity.is_lucia_bypass()
                OR (operating_company_id)::text = current_setting(''app.operating_company_id'', true))
         WITH CHECK (identity.is_lucia_bypass()
                OR (operating_company_id)::text = current_setting(''app.operating_company_id'', true))',
      v_tbl);
  END LOOP;
END
$mig$;

-- VOID-NOT-DELETE hardening: these are reference catalogs with soft-delete (deactivated_at /
-- is_active); the factory never issues DELETE. Revoke DELETE so a stray hard-delete can't erase a
-- catalog row another entity's records point at. (KEEP the arw default; only DELETE is removed.)
DO $revoke$
DECLARE v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'asset_condition_codes','asset_locations','asset_statuses','unit_ownership_types',
    'trailer_types','lease_terms','tractor_statuses','trailer_statuses'
  ] LOOP
    EXECUTE format('REVOKE DELETE ON catalogs.%I FROM ih35_app', v_tbl);
  END LOOP;
END
$revoke$;
