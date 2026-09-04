-- FLT-08: canonical unit document categories for registration and compliance evidence.
-- Additive/idempotent catalog upsert. No fixture rows, hardcoded UUIDs, deletes, or drops.

INSERT INTO catalogs.file_categories (
  code,
  label,
  description,
  applies_to,
  typical_expiration_months,
  requires_expiration_date,
  is_active,
  deactivated_at
)
VALUES
  (
    'dot_inspection',
    'Annual DOT Inspection',
    'Annual DOT inspection evidence for a unit.',
    ARRAY['unit'],
    12,
    true,
    true,
    NULL
  ),
  (
    'vehicle_registration',
    'Vehicle Registration',
    'Vehicle registration evidence for a unit.',
    ARRAY['unit'],
    12,
    true,
    true,
    NULL
  ),
  (
    'ifta',
    'IFTA',
    'International Fuel Tax Agreement registration evidence for a unit.',
    ARRAY['unit'],
    12,
    true,
    true,
    NULL
  ),
  (
    'form_2290',
    'Form 2290',
    'Heavy Highway Vehicle Use Tax filing evidence for a unit.',
    ARRAY['unit'],
    12,
    true,
    true,
    NULL
  ),
  (
    'vehicle_title',
    'Vehicle Title',
    'Vehicle title evidence for a unit.',
    ARRAY['unit'],
    NULL,
    false,
    true,
    NULL
  )
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  applies_to = EXCLUDED.applies_to,
  typical_expiration_months = EXCLUDED.typical_expiration_months,
  requires_expiration_date = EXCLUDED.requires_expiration_date,
  is_active = true,
  deactivated_at = NULL,
  updated_at = now()
WHERE ROW(
  catalogs.file_categories.label,
  catalogs.file_categories.description,
  catalogs.file_categories.applies_to,
  catalogs.file_categories.typical_expiration_months,
  catalogs.file_categories.requires_expiration_date,
  catalogs.file_categories.is_active,
  catalogs.file_categories.deactivated_at
) IS DISTINCT FROM ROW(
  EXCLUDED.label,
  EXCLUDED.description,
  EXCLUDED.applies_to,
  EXCLUDED.typical_expiration_months,
  EXCLUDED.requires_expiration_date,
  true,
  NULL
);
