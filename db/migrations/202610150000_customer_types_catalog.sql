-- LST-WIRE-07 — catalogs.customer_types (QuickBooks "Customer Type").
--
-- QuickBooks lets a business classify customers (Commercial, Broker, Government, Direct Shipper …) and
-- report by that classification. This system had no such catalog at all — verified live 2026-07-29,
-- to_regclass('catalogs.customer_types') IS NULL — so customers could not be segmented and no report
-- could group by type.
--
-- Canonical catalog shape from the outset (code / display_name / description / is_active / sort_order),
-- so the generic catalog factory serves it with no bespoke code and no follow-up shape migration. This
-- is deliberately NOT the shape vendor_types was born with: that one used vendor_type_name and needed a
-- later additive migration (202610130000) before it could be wired.
--
-- Entity-scoped with FORCED RLS mirroring catalogs.vendor_types / catalogs.classes. Additive and
-- idempotent; seeds starter rows per ACTIVE company without hardcoding a single UUID.

CREATE TABLE IF NOT EXISTS catalogs.customer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_types_company_code
  ON catalogs.customer_types (operating_company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_types_company_display_name
  ON catalogs.customer_types (operating_company_id, display_name);
CREATE INDEX IF NOT EXISTS idx_customer_types_operating_company_id
  ON catalogs.customer_types (operating_company_id);

-- Composite unique so a future same-entity FK from mdata.customers can point here without allowing a
-- cross-entity reference (the pattern catalogs.vendor_types already uses).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname = 'uq_customer_types_company_id' AND conrelid = 'catalogs.customer_types'::regclass) THEN
    ALTER TABLE catalogs.customer_types ADD CONSTRAINT uq_customer_types_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

ALTER TABLE catalogs.customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.customer_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_types_entity_select ON catalogs.customer_types;
CREATE POLICY customer_types_entity_select ON catalogs.customer_types FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS customer_types_entity_write ON catalogs.customer_types;
CREATE POLICY customer_types_entity_write ON catalogs.customer_types FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])));

-- Runtime role needs the new table (migration 0065 + DEFAULT PRIVILEGES pattern). No DELETE:
-- retirement is is_active=false / deactivated_at (void-not-delete).
GRANT SELECT, INSERT, UPDATE ON catalogs.customer_types TO ih35_app;

-- Starter rows per ACTIVE company. Dynamic over org.companies — never a hardcoded UUID, so this seeds
-- correctly on prod, on a branch copy, and on the fresh database CI migrates.
INSERT INTO catalogs.customer_types (operating_company_id, code, display_name, description, sort_order)
SELECT c.id, s.code, s.display_name, s.description, s.sort_order
  FROM org.companies c
  CROSS JOIN (VALUES
    ('COMMERCIAL',     'Commercial',      'Direct commercial shipper',                      10),
    ('BROKER',         'Broker',          'Freight broker or 3PL intermediary',             20),
    ('SHIPPER_DIRECT', 'Direct Shipper',  'Manufacturer or distributor shipping own freight', 30),
    ('GOVERNMENT',     'Government',      'Government or municipal account',                40),
    ('INTERCOMPANY',   'Intercompany',    'Another IH35 operating entity',                  50),
    ('OTHER',          'Other',           'Uncategorised',                                  90)
  ) AS s(code, display_name, description, sort_order)
 WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;
