-- DOC-REQ-1 (owner decision #6) — required-document-types catalog + FMCSA/IRS regulatory-default seed.
-- Tier-1 (migration) → BUILD-AND-HOLD; never self-merged. Design: docs/specs/REQUIRED-DOCUMENT-TYPES.md.
-- Turns "Missing required documents" into truth: one entity-scoped catalog of which documents are required
-- per entity type, warn-first, per-type promote-to-hard-block, per-carrier configurable.
-- Fully idempotent (IF NOT EXISTS / DROP-CREATE policies / ON CONFLICT DO NOTHING). Money-free.
-- The `compliance` schema already exists and is grant-covered (migration 0065). No new schema.

CREATE TABLE IF NOT EXISTS compliance.required_document_types (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  entity_kind           text NOT NULL CHECK (entity_kind IN ('driver','unit','customer','vendor')),
  code                  text NOT NULL,
  label                 text NOT NULL,
  authority             text,
  enforcement           text NOT NULL DEFAULT 'warn' CHECK (enforcement IN ('warn','hard_block')),
  has_expiry            boolean NOT NULL DEFAULT false,
  is_seed               boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, entity_kind, code)
);

CREATE INDEX IF NOT EXISTS required_document_types_opco_kind_idx
  ON compliance.required_document_types (operating_company_id, entity_kind)
  WHERE is_active;

-- ── Entity-scoped, FORCED RLS (reuse the canonical accounts/items pattern) ──────────────────────────
ALTER TABLE compliance.required_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.required_document_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS required_document_types_entity_select ON compliance.required_document_types;
DROP POLICY IF EXISTS required_document_types_entity_write ON compliance.required_document_types;
CREATE POLICY required_document_types_entity_select ON compliance.required_document_types FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY required_document_types_entity_write ON compliance.required_document_types FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

-- ── Self-contained GRANTs (no DELETE — void via is_active). Schema is in the 0065 array already. ─────
GRANT SELECT, INSERT, UPDATE ON compliance.required_document_types TO ih35_app;

-- ── FMCSA / IRS regulatory-default seed for every existing carrier (idempotent). New carriers inherit
--    these via a bootstrap hook (DOC-REQ follow-up). Seed runs under a lucia bypass so FORCE RLS permits
--    the INSERT regardless of the migration role; ON CONFLICT keeps re-runs a no-op. ──────────────────
DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO compliance.required_document_types
    (operating_company_id, entity_kind, code, label, authority, has_expiry, sort_order, is_seed)
  SELECT c.id, v.entity_kind, v.code, v.label, v.authority, v.has_expiry, v.sort_order, true
  FROM org.companies c
  CROSS JOIN (VALUES
    -- drivers
    ('driver'::text,   'cdl',                'Commercial Driver License',        'FMCSA §383',      true,  10),
    ('driver',         'med_cert',           'DOT Medical Certificate',          'FMCSA §391.41',   true,  20),
    ('driver',         'mvr',                'Motor Vehicle Record',             'FMCSA §391.25',   true,  30),
    ('driver',         'clearinghouse',      'Drug & Alcohol Clearinghouse',     'FMCSA §382.701',  true,  40),
    ('driver',         'driver_application', 'Driver Employment Application',    'FMCSA §391.21',   false, 50),
    ('driver',         'w9',                 'Form W-9 (or W-8BEN if foreign)',  'IRS',             false, 60),
    -- units
    ('unit',           'registration',       'Vehicle Registration (cab card)',  'State DMV',       true,  10),
    ('unit',           'annual_inspection',  'Annual DOT Inspection',            'FMCSA §396.17',   true,  20),
    ('unit',           'ifta',               'IFTA License / Decal',             'IFTA',            true,  30),
    ('unit',           'form_2290',          'Form 2290 (HVUT) Schedule 1',      'IRS Form 2290',   true,  40),
    ('unit',           'insurance',          'Insurance / Cab-card proof',       'State / FMCSA',   true,  50),
    -- customers
    ('customer',       'credit_app',         'Credit Application',               NULL,              false, 10),
    ('customer',       'w9',                 'Form W-9',                         'IRS',             false, 20),
    ('customer',       'msa',                'Master Service Agreement',         NULL,              false, 30),
    ('customer',       'noa',                'Notice of Assignment (if factored)', NULL,            false, 40),
    -- vendors
    ('vendor',         'w9',                 'Form W-9',                         'IRS',             false, 10),
    ('vendor',         'coi',                'Certificate of Insurance',         NULL,              true,  20),
    ('vendor',         'agreement',          'Vendor / Carrier Agreement',       NULL,              false, 30)
  ) AS v(entity_kind, code, label, authority, has_expiry, sort_order)
  ON CONFLICT (operating_company_id, entity_kind, code) DO NOTHING;
END
$seed$;
