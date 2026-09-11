-- LEAD ITEM 1 (2026-09-11 22:30 UTC, deadline 23:30 UTC): catalogs.load_exception_reasons.
-- CC-2's Truck Line needs this catalog; migration lane is CC-1's per the owner's 17:25 CT ruling.
-- DEVIATION DECLARED (spec said "uuidv7 default like the other catalogs"): live prod
-- (br-fancy-credit-akjnd07a, PostgreSQL 16.15) has NO uuidv7()/uuid_generate_v7() function at all —
-- checked live via pg_proc before writing this. Every existing catalogs.* table's id column default
-- is gen_random_uuid() (checked live via information_schema.columns across the whole schema); this
-- migration matches that real, live convention rather than inventing a function that does not exist.
BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.load_exception_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'load',
  linked_module TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_load_exception_reasons_company_active
  ON catalogs.load_exception_reasons (operating_company_id, is_active, sort_order);

ALTER TABLE catalogs.load_exception_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.load_exception_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS load_exception_reasons_select ON catalogs.load_exception_reasons;
CREATE POLICY load_exception_reasons_select ON catalogs.load_exception_reasons
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS load_exception_reasons_insert ON catalogs.load_exception_reasons;
CREATE POLICY load_exception_reasons_insert ON catalogs.load_exception_reasons
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS load_exception_reasons_update ON catalogs.load_exception_reasons;
CREATE POLICY load_exception_reasons_update ON catalogs.load_exception_reasons
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.load_exception_reasons TO ih35_app;

-- Seed USMCA ONLY (5c854333-6ea5-4faa-af31-67cb272fef80), ON CONFLICT DO NOTHING, in the exact
-- code/name/linked_module order the Lead specified.
WITH seed(code, name, linked_module, sort_order) AS (
  VALUES
    ('breakdown_roadside',   'Breakdown — roadside',        'maintenance',       10),
    ('breakdown_towed',      'Breakdown — towed to shop',   'maintenance',       20),
    ('accident',             'Accident / incident',         'safety',            30),
    ('weather',              'Weather / road closure',      NULL,                40),
    ('border_hold',          'Border / customs hold',       'border',            50),
    ('detention',            'Detention at shipper / receiver', 'detention',     60),
    ('layover',              'Layover',                     'accessorial_4220',  70),
    ('driver_rest',          'Driver rest / HOS',           NULL,                80),
    ('reroute',              'Reroute / new appointment',   'dispatch',          90),
    ('customer_cancelled',   'Load cancelled by customer',  'cancel_load',      100),
    ('other',                'Other (note required)',       NULL,               110)
)
-- DRIVER-COMPLIANCE-01 (CC-3, 2026-09-11): the bare hardcoded UUID broke a fresh/CI-replayed DB
-- (org.companies_operating_company_id_fkey, 0 companies seeded there) -- prod already has this row
-- so this WHERE EXISTS changes nothing there, only makes the seed skip cleanly on an empty DB.
INSERT INTO catalogs.load_exception_reasons (
  operating_company_id, code, name, applies_to, linked_module, sort_order
)
SELECT '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid, s.code, s.name, 'load', s.linked_module, s.sort_order
FROM seed s
WHERE EXISTS (SELECT 1 FROM org.companies WHERE id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid)
ON CONFLICT (operating_company_id, code) DO NOTHING;

COMMIT;
