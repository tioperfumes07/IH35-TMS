-- 0318_equipment_types_canonical_dedup.sql
-- Canonicalize duplicate catalogs.equipment_types rows (hyphen vs underscore codes,
-- singular vs plural names). Archives duplicates; preserves ledger via deactivated_at.
-- Reversible using catalogs.equipment_types_dedup_ledger_0318.

BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.equipment_types_dedup_ledger_0318 (
  duplicate_id uuid PRIMARY KEY,
  canonical_id uuid NOT NULL REFERENCES catalogs.equipment_types(id),
  duplicate_code text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogs.equipment_types_dedup_ledger_0318 IS
  'A11 Block-J: maps archived duplicate equipment_types rows to their canonical survivor for rollback.';

CREATE OR REPLACE FUNCTION catalogs.normalize_equipment_type_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(trim(replace(replace(COALESCE(p_value, ''), '_', '-'), '  ', ' '))),
    'd$',
    ''
  );
$$;

WITH active_types AS (
  SELECT
    et.id,
    et.code,
    et.name,
    et.sort_order,
    et.created_at,
    catalogs.normalize_equipment_type_key(et.code) AS norm_code,
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
      PARTITION BY at.norm_code
      ORDER BY
        at.line_item_count DESC,
        at.is_hyphen_code ASC,
        at.sort_order ASC,
        at.created_at ASC,
        at.code ASC
    ) AS canonical_id
  FROM active_types at
),
pairs AS (
  SELECT r.id AS duplicate_id, r.canonical_id, r.code AS duplicate_code
  FROM ranked r
  WHERE r.id <> r.canonical_id
    AND NOT EXISTS (
      SELECT 1 FROM catalogs.equipment_types_dedup_ledger_0318 l WHERE l.duplicate_id = r.id
    )
)
INSERT INTO catalogs.equipment_types_dedup_ledger_0318 (duplicate_id, canonical_id, duplicate_code)
SELECT duplicate_id, canonical_id, duplicate_code FROM pairs;

-- Also collapse rows that share normalized display name but differ in code (e.g. OVERSIZE vs OVERSIZED).
WITH active_types AS (
  SELECT
    et.id,
    et.code,
    et.name,
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
      PARTITION BY at.norm_name
      ORDER BY
        at.line_item_count DESC,
        at.is_hyphen_code ASC,
        at.sort_order ASC,
        at.created_at ASC,
        at.code ASC
    ) AS canonical_id
  FROM active_types at
),
pairs AS (
  SELECT r.id AS duplicate_id, r.canonical_id, r.code AS duplicate_code
  FROM ranked r
  WHERE r.id <> r.canonical_id
    AND NOT EXISTS (
      SELECT 1 FROM catalogs.equipment_types_dedup_ledger_0318 l WHERE l.duplicate_id = r.id
    )
)
INSERT INTO catalogs.equipment_types_dedup_ledger_0318 (duplicate_id, canonical_id, duplicate_code)
SELECT duplicate_id, canonical_id, duplicate_code FROM pairs
ON CONFLICT (duplicate_id) DO NOTHING;

-- Deactivate driver qualifications that would violate UNIQUE (driver_id, equipment_type_id) after merge.
WITH merge_conflicts AS (
  SELECT
    dq.id,
    row_number() OVER (
      PARTITION BY dq.driver_id, l.canonical_id
      ORDER BY dq.qualified_at DESC NULLS LAST, dq.created_at ASC, dq.id ASC
    ) AS rn
  FROM mdata.driver_equipment_qualifications dq
  JOIN catalogs.equipment_types_dedup_ledger_0318 l ON dq.equipment_type_id = l.duplicate_id
  WHERE dq.deactivated_at IS NULL
)
UPDATE mdata.driver_equipment_qualifications dq
SET
  deactivated_at = COALESCE(dq.deactivated_at, now()),
  is_active = false,
  updated_at = now()
FROM merge_conflicts mc
WHERE dq.id = mc.id
  AND mc.rn > 1;

-- Repoint FK references before archive.
UPDATE mdata.driver_equipment_qualifications dq
SET
  equipment_type_id = l.canonical_id,
  updated_at = now()
FROM catalogs.equipment_types_dedup_ledger_0318 l
WHERE dq.equipment_type_id = l.duplicate_id
  AND dq.deactivated_at IS NULL;

-- Move line item templates that do not conflict on (equipment_type_id, code).
UPDATE catalogs.equipment_line_item_templates lit
SET
  equipment_type_id = l.canonical_id,
  updated_at = now()
FROM catalogs.equipment_types_dedup_ledger_0318 l
WHERE lit.equipment_type_id = l.duplicate_id
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.equipment_line_item_templates existing
    WHERE existing.equipment_type_id = l.canonical_id
      AND existing.code = lit.code
      AND existing.id <> lit.id
  );

-- Deactivate orphaned templates still on duplicate rows.
UPDATE catalogs.equipment_line_item_templates lit
SET
  deactivated_at = COALESCE(lit.deactivated_at, now()),
  is_active = false,
  updated_at = now()
FROM catalogs.equipment_types_dedup_ledger_0318 l
WHERE lit.equipment_type_id = l.duplicate_id
  AND lit.deactivated_at IS NULL;

-- Canonical display names (title case words per product vocabulary).
UPDATE catalogs.equipment_types et
SET
  name = CASE catalogs.normalize_equipment_type_key(et.code)
    WHEN 'dry-van' THEN 'Dry Van'
    WHEN 'reefer' THEN 'Reefer'
    WHEN 'flatbed' THEN 'Flatbed'
    WHEN 'step-deck' THEN 'Step Deck'
    WHEN 'lowboy' THEN 'Lowboy'
    WHEN 'oversize' THEN 'Oversize'
    WHEN 'tanker' THEN 'Tanker'
    WHEN 'auto-hauler' THEN 'Auto Hauler'
    WHEN 'pneumatic' THEN 'Pneumatic'
    WHEN 'container' THEN 'Container'
    WHEN 'custom' THEN 'Custom'
    ELSE et.name
  END,
  updated_at = now()
WHERE et.deactivated_at IS NULL
  AND catalogs.normalize_equipment_type_key(et.code) IN (
    'dry-van', 'reefer', 'flatbed', 'step-deck', 'lowboy', 'oversize',
    'tanker', 'auto-hauler', 'pneumatic', 'container', 'custom'
  );

-- Archive duplicate catalog rows (ledger preserved).
UPDATE catalogs.equipment_types et
SET
  deactivated_at = COALESCE(et.deactivated_at, now()),
  is_active = false,
  updated_at = now()
FROM catalogs.equipment_types_dedup_ledger_0318 l
WHERE et.id = l.duplicate_id
  AND et.deactivated_at IS NULL;

-- Monotonic sort_order in 10-step increments for active rows.
WITH ordered AS (
  SELECT
    et.id,
    (row_number() OVER (ORDER BY et.sort_order ASC, et.name ASC, et.code ASC) * 10)::int AS new_sort_order
  FROM catalogs.equipment_types et
  WHERE et.deactivated_at IS NULL
)
UPDATE catalogs.equipment_types et
SET sort_order = o.new_sort_order, updated_at = now()
FROM ordered o
WHERE et.id = o.id
  AND et.sort_order IS DISTINCT FROM o.new_sort_order;

COMMIT;
