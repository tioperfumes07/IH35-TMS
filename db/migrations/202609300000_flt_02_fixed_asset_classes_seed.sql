-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] FLT-02 / FLT-03 — seed accounting.fixed_asset_classes.
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. ***
--
-- LIVE (GUARD 2026-07-27): accounting.fixed_asset_classes = 0 rows. class_id is a REQUIRED FK on
-- accounting.fixed_assets, so Claude's create path cannot land until these rows exist.
--
-- Spec (docs/specs/FIXED-ASSETS-DATA-MODEL-2026-06-28.md §10.4): truck / trailer / car (depreciable,
-- straight_line, 60 months) + land (non-depreciable). GL account defaults LEFT NULL — owner binds
-- CoA roles/accounts later; never hardcode account UUIDs.
-- Resolve companies BY CODE — never hardcode UUIDs.
-- Numbered 202609300000 — above prod ledger max 202609280000 and DISP-01 202609290000.
-- Idempotent / fresh-DB-safe.

-- CANONICAL-CHECK: fixed_asset_class_catalog. accounting.fixed_asset_classes is NOT a money ledger
-- and NOT a duplicate of accounting.fixed_assets / depreciation_schedule_rows / journal_entries.
-- It is the owner-editable CLASS CATALOG (QBO Fixed Asset Item / NetSuite Asset Type pattern) that
-- supplies default method/life for register rows. Money lives only in fixed_assets + JE postings.
-- Seeding rows here POSTS NOTHING.

BEGIN;

DO $$
DECLARE
  v_company uuid;
  r record;
BEGIN
  IF to_regclass('accounting.fixed_asset_classes') IS NULL THEN
    RAISE NOTICE 'FLT-02 class seed: accounting.fixed_asset_classes missing — skip (data-model mig not applied)';
    RETURN;
  END IF;

  FOR r IN
    SELECT id, code FROM org.companies WHERE code = ANY (ARRAY['TRK', 'TRANSP', 'USMCA'])
  LOOP
    v_company := r.id;

    INSERT INTO accounting.fixed_asset_classes (
      operating_company_id, class_code, class_name, is_depreciable,
      default_method, default_useful_life_months, is_active
    )
    SELECT v_company, 'truck', 'Trucks', true, 'straight_line', 60, true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.fixed_asset_classes c
      WHERE c.operating_company_id = v_company AND c.class_code = 'truck' AND c.is_active
    );

    INSERT INTO accounting.fixed_asset_classes (
      operating_company_id, class_code, class_name, is_depreciable,
      default_method, default_useful_life_months, is_active
    )
    SELECT v_company, 'trailer', 'Trailers', true, 'straight_line', 60, true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.fixed_asset_classes c
      WHERE c.operating_company_id = v_company AND c.class_code = 'trailer' AND c.is_active
    );

    INSERT INTO accounting.fixed_asset_classes (
      operating_company_id, class_code, class_name, is_depreciable,
      default_method, default_useful_life_months, is_active
    )
    SELECT v_company, 'car', 'Cars', true, 'straight_line', 60, true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.fixed_asset_classes c
      WHERE c.operating_company_id = v_company AND c.class_code = 'car' AND c.is_active
    );

    INSERT INTO accounting.fixed_asset_classes (
      operating_company_id, class_code, class_name, is_depreciable,
      default_method, default_useful_life_months, is_active
    )
    SELECT v_company, 'land', 'Land', false, 'straight_line', 60, true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.fixed_asset_classes c
      WHERE c.operating_company_id = v_company AND c.class_code = 'land' AND c.is_active
    );
  END LOOP;
END
$$;

COMMIT;
