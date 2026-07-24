-- 202607911000_equipment_types_norm_dedupe_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies. Companion to 202607910000.
-- Within each operating_company_id, deactivate equipment_types rows that collide on the
-- same normalized code/name (DRY_VAN vs DRY-VAN, OVERSIZED vs OVERSIZE). Prefer the
-- survivor chosen like 0318 (most templates, then hyphenated code, then sort_order).
-- Re-points active templates to the survivor. Idempotent. Safe no-op when already clean
-- (prod after owner apply of 910 with 7 clean codes/entity).

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='catalogs' AND table_name='equipment_types' AND column_name='operating_company_id'
  ) THEN
    RAISE NOTICE '202607911000: operating_company_id missing — skip (910 not applied)';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION catalogs.normalize_equipment_type_key(p_value text)
  RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(
      lower(trim(replace(replace(COALESCE(p_value, ''), '_', '-'), '  ', ' '))),
      'd$',
      ''
    );
  $$;

  -- Archive norm-code collisions per entity.
  WITH active_types AS (
    SELECT
      et.id,
      et.operating_company_id,
      et.code,
      et.sort_order,
      et.created_at,
      catalogs.normalize_equipment_type_key(et.code) AS norm_code,
      (SELECT count(*)::int FROM catalogs.equipment_line_item_templates lit
        WHERE lit.equipment_type_id = et.id AND lit.deactivated_at IS NULL) AS line_item_count,
      CASE WHEN et.code LIKE '%-%' THEN 1 ELSE 0 END AS is_hyphen_code
    FROM catalogs.equipment_types et
    WHERE et.deactivated_at IS NULL
  ),
  ranked AS (
    SELECT
      at.*,
      first_value(at.id) OVER (
        PARTITION BY at.operating_company_id, at.norm_code
        ORDER BY at.line_item_count DESC, at.is_hyphen_code ASC, at.sort_order ASC, at.created_at ASC, at.code ASC
      ) AS canonical_id
    FROM active_types at
  ),
  losers AS (
    SELECT id, canonical_id FROM ranked WHERE id <> canonical_id
  )
  UPDATE catalogs.equipment_line_item_templates lit
     SET equipment_type_id = l.canonical_id
    FROM losers l
   WHERE lit.equipment_type_id = l.id
     AND lit.deactivated_at IS NULL;

  WITH active_types AS (
    SELECT
      et.id,
      et.operating_company_id,
      et.code,
      et.sort_order,
      et.created_at,
      catalogs.normalize_equipment_type_key(et.code) AS norm_code,
      (SELECT count(*)::int FROM catalogs.equipment_line_item_templates lit
        WHERE lit.equipment_type_id = et.id AND lit.deactivated_at IS NULL) AS line_item_count,
      CASE WHEN et.code LIKE '%-%' THEN 1 ELSE 0 END AS is_hyphen_code
    FROM catalogs.equipment_types et
    WHERE et.deactivated_at IS NULL
  ),
  ranked AS (
    SELECT
      at.*,
      first_value(at.id) OVER (
        PARTITION BY at.operating_company_id, at.norm_code
        ORDER BY at.line_item_count DESC, at.is_hyphen_code ASC, at.sort_order ASC, at.created_at ASC, at.code ASC
      ) AS canonical_id
    FROM active_types at
  )
  UPDATE catalogs.equipment_types et
     SET deactivated_at = now(), is_active = false
    FROM ranked r
   WHERE et.id = r.id
     AND r.id <> r.canonical_id
     AND et.deactivated_at IS NULL;

  -- Archive norm-name collisions per entity (OVERSIZE vs OVERSIZED).
  WITH active_types AS (
    SELECT
      et.id,
      et.operating_company_id,
      et.code,
      et.sort_order,
      et.created_at,
      catalogs.normalize_equipment_type_key(et.name) AS norm_name,
      (SELECT count(*)::int FROM catalogs.equipment_line_item_templates lit
        WHERE lit.equipment_type_id = et.id AND lit.deactivated_at IS NULL) AS line_item_count,
      CASE WHEN et.code LIKE '%-%' THEN 1 ELSE 0 END AS is_hyphen_code
    FROM catalogs.equipment_types et
    WHERE et.deactivated_at IS NULL
  ),
  ranked AS (
    SELECT
      at.*,
      first_value(at.id) OVER (
        PARTITION BY at.operating_company_id, at.norm_name
        ORDER BY at.line_item_count DESC, at.is_hyphen_code ASC, at.sort_order ASC, at.created_at ASC, at.code ASC
      ) AS canonical_id
    FROM active_types at
  ),
  losers AS (
    SELECT id, canonical_id FROM ranked WHERE id <> canonical_id
  )
  UPDATE catalogs.equipment_line_item_templates lit
     SET equipment_type_id = l.canonical_id
    FROM losers l
   WHERE lit.equipment_type_id = l.id
     AND lit.deactivated_at IS NULL;

  WITH active_types AS (
    SELECT
      et.id,
      et.operating_company_id,
      et.code,
      et.sort_order,
      et.created_at,
      catalogs.normalize_equipment_type_key(et.name) AS norm_name,
      (SELECT count(*)::int FROM catalogs.equipment_line_item_templates lit
        WHERE lit.equipment_type_id = et.id AND lit.deactivated_at IS NULL) AS line_item_count,
      CASE WHEN et.code LIKE '%-%' THEN 1 ELSE 0 END AS is_hyphen_code
    FROM catalogs.equipment_types et
    WHERE et.deactivated_at IS NULL
  ),
  ranked AS (
    SELECT
      at.*,
      first_value(at.id) OVER (
        PARTITION BY at.operating_company_id, at.norm_name
        ORDER BY at.line_item_count DESC, at.is_hyphen_code ASC, at.sort_order ASC, at.created_at ASC, at.code ASC
      ) AS canonical_id
    FROM active_types at
  )
  UPDATE catalogs.equipment_types et
     SET deactivated_at = now(), is_active = false
    FROM ranked r
   WHERE et.id = r.id
     AND r.id <> r.canonical_id
     AND et.deactivated_at IS NULL;
END
$mig$;
