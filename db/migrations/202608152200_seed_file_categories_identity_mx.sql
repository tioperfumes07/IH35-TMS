-- LV-DOC-CATEGORIES-MISSING-IDENTITY-AND-MX-LICENCE
-- Seed driver identity / passport / visa / Mexican federal licence categories.
-- Global UNIQUE(code); ON CONFLICT DO NOTHING — additive only, never archive/retype.
-- Pattern: 0028_docs_schema.sql + 202606120300_c3_customer_contract.sql

INSERT INTO catalogs.file_categories (
  code, label, description, applies_to, typical_expiration_months, requires_expiration_date
) VALUES
  (
    'identity_document',
    'Identity Document (INE / voter ID)',
    'Government photo ID — Mexican INE/IFE voter credential or equivalent identity document.',
    ARRAY['driver'],
    NULL,
    false
  ),
  (
    'passport',
    'Passport',
    'Passport biographical page (any issuing country).',
    ARRAY['driver'],
    120,
    true
  ),
  (
    'visa',
    'Visa / Immigration Document',
    'US or other visa / immigration credential tied to border ops.',
    ARRAY['driver'],
    12,
    true
  ),
  (
    'mexican_federal_license',
    'Mexican Federal License (Licencia Federal)',
    'Mexican Licencia Federal de Conductor — distinct from US CDL.',
    ARRAY['driver'],
    48,
    true
  )
ON CONFLICT (code) DO NOTHING;
