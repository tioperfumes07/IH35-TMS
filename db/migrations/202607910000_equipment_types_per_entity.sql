-- 202607910000_equipment_types_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. This migration runs ONLY on a Neon branch by the owner's hand, then is
-- ledger-backfilled so prod db:migrate skips it. catalogs.* schema change = owner-gated (financial
-- cluster). Registered in .held-migrations.json.
--
-- PER-ENTITY CONVERSION of catalogs.equipment_types + its child catalogs.equipment_line_item_templates
-- (owner ruling 2026-07-24: "per entity, same catalog for all entities"). Completes the fleet-catalog
-- factory conversion started in 202607860000 (equipment_types was held back there because it has a
-- DUAL write-surface — the fleet factory AND the legacy /catalogs/equipment-types route — plus a child
-- template table; both are handled in this PR).
--
-- PARENT (equipment_types, 7 rows, gen_random_uuid PKs): add operating_company_id (backfill existing ->
-- primary company resolved DYNAMICALLY from org.companies), COPY the primary's rows to every other
-- active company with fresh PKs, swap UNIQUE(code) -> UNIQUE(operating_company_id, code), FORCE RLS,
-- REVOKE DELETE.
--
-- CHILD (equipment_line_item_templates, 14 rows, FK equipment_type_id -> equipment_types ON DELETE
-- CASCADE, unique (equipment_type_id, code)): add operating_company_id (backfill from the PARENT's
-- opco so a template always shares its equipment type's entity). The seed copies each entity's
-- templates pointing at THAT ENTITY'S copied equipment_type — remapped by JOINing parent code -> the
-- seed entity's equipment_type of the same code. The (equipment_type_id, code) unique stays valid
-- because equipment_type_id already differs per entity. FORCE RLS, REVOKE DELETE.
--
-- IDEMPOTENT: IF NOT EXISTS / ON CONFLICT / catalog-of-constraints guards; safe to apply twice and on
-- the fresh-DB CI migrate from 0001. Existing parent rows keep their PKs on the primary company, so the
-- 3 inbound FKs to equipment_types (templates, dedup_ledger, driver_equipment_qualifications) and the 1
-- to templates (driver_pay_rates) are undisturbed.

DO $mig$
DECLARE
  v_primary uuid := COALESCE(
    (SELECT id FROM org.companies WHERE id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96' AND deactivated_at IS NULL),
    (SELECT id FROM org.companies WHERE deactivated_at IS NULL ORDER BY created_at, id LIMIT 1)
  );
  v_seed uuid;
BEGIN
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'equipment_types_per_entity: no active org.companies row to own the catalog';
  END IF;

  -- 1) PARENT structure.
  ALTER TABLE catalogs.equipment_types ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.equipment_types SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  ALTER TABLE catalogs.equipment_types ALTER COLUMN operating_company_id SET NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_types_opco_fk') THEN
    ALTER TABLE catalogs.equipment_types
      ADD CONSTRAINT equipment_types_opco_fk FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
  ALTER TABLE catalogs.equipment_types DROP CONSTRAINT IF EXISTS equipment_types_code_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_types_opco_code_key') THEN
    ALTER TABLE catalogs.equipment_types
      ADD CONSTRAINT equipment_types_opco_code_key UNIQUE (operating_company_id, code);
  END IF;

  -- 2) CHILD structure. Backfill each template's opco from its PARENT equipment_type (all primary now).
  ALTER TABLE catalogs.equipment_line_item_templates ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.equipment_line_item_templates lit
    SET operating_company_id = et.operating_company_id
    FROM catalogs.equipment_types et
    WHERE et.id = lit.equipment_type_id
      AND lit.operating_company_id IS NULL;
  ALTER TABLE catalogs.equipment_line_item_templates ALTER COLUMN operating_company_id SET NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_line_item_templates_opco_fk') THEN
    ALTER TABLE catalogs.equipment_line_item_templates
      ADD CONSTRAINT equipment_line_item_templates_opco_fk FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  -- 3) SEED per OTHER active company: parent first, then child remapped onto the seed's equipment_types.
  FOR v_seed IN SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary LOOP
    INSERT INTO catalogs.equipment_types (operating_company_id, code, name, description, is_active, sort_order)
      SELECT v_seed, code, name, description, is_active, sort_order
      FROM catalogs.equipment_types
      WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    INSERT INTO catalogs.equipment_line_item_templates
      (operating_company_id, equipment_type_id, code, name, description, unit, sort_order, is_required, is_active)
      SELECT v_seed, et_seed.id, lit.code, lit.name, lit.description, lit.unit, lit.sort_order, lit.is_required, lit.is_active
      FROM catalogs.equipment_line_item_templates lit
      JOIN catalogs.equipment_types et_pri
        ON et_pri.id = lit.equipment_type_id AND et_pri.operating_company_id = v_primary
      JOIN catalogs.equipment_types et_seed
        ON et_seed.operating_company_id = v_seed AND et_seed.code = et_pri.code
      WHERE lit.operating_company_id = v_primary
    ON CONFLICT (equipment_type_id, code) DO NOTHING;
  END LOOP;

  -- 4) RLS: ENABLE + FORCE + standard GUC company_scope policy on BOTH tables.
  ALTER TABLE catalogs.equipment_types ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.equipment_types FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.equipment_types;
  CREATE POLICY company_scope ON catalogs.equipment_types
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));

  ALTER TABLE catalogs.equipment_line_item_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.equipment_line_item_templates FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.equipment_line_item_templates;
  CREATE POLICY company_scope ON catalogs.equipment_line_item_templates
    FOR ALL
    USING (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR (operating_company_id)::text = current_setting('app.operating_company_id', true));
END
$mig$;

-- VOID-NOT-DELETE hardening on both (soft-delete via deactivated_at / is_active; routes never DELETE).
REVOKE DELETE ON catalogs.equipment_types FROM ih35_app;
REVOKE DELETE ON catalogs.equipment_line_item_templates FROM ih35_app;
