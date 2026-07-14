-- [HOLD-FOR-JORGE — financial] Vendor Type catalog (catalogs.vendor_types) + mdata.vendors linkage.
-- POSTS NOTHING. Owner merges (financial cluster: catalogs.* + a migration).
--
-- ROOT CAUSE: QuickBooks exposes a "Vendor Type" list, and the TMS reconcile projection already counts a
-- remote `catalog.vendor_types` entity (0055/0123/0201 qbo_remote_counts), but there is NO local vendor-type
-- catalog. Today `mdata.vendors.vendor_type` is a hardcoded CHECK-text column
--   ('Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other')
-- with no catalog table, no QBO-mirror id, and no per-entity scoping — so it cannot reconcile against QBO,
-- cannot be extended per entity, and has no inline "+ Add new" catalog source.
--
-- SCOPE (schema/catalog/linkage only — NO GL/posting math):
--   1. New per-entity catalog `catalogs.vendor_types` mirroring the AF-1/AF-2/AF-3 pattern
--      (catalogs.accounts / items / classes): operating_company_id NOT NULL, FORCED entity+role RLS,
--      per-entity composite uniques, qbo_vendor_type_id mirror column, ih35_app grants (no DELETE — void-not-delete).
--   2. Seed the 8 canonical system types per operating company (idempotent).
--   3. LINKAGE (LINKAGE-LAW §10 C3/C4): add nullable mdata.vendors.vendor_type_id with a SAME-ENTITY
--      composite FK (operating_company_id, vendor_type_id) -> catalogs.vendor_types(operating_company_id, id),
--      and backfill it from the existing vendor_type text. The existing vendor_type text column is KEPT
--      untouched (ADDITIVE-ONLY — ap-aging.service / pse-mirror.service still read it).
--
-- Idempotent + fresh-DB-CI safe (EXISTS-guarded, ON CONFLICT, JOINs over org.companies / mdata.vendors that
-- are empty on a fresh 0001 DB -> clean no-op, never RAISE). Validate on a Neon branch only; NEVER run on prod
-- without Jorge's JORGE-APPROVED ceremony.

BEGIN;

-- 1) Catalog table (per-entity, QBO-mirrorable) -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogs.vendor_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vendor_type_name text NOT NULL,
  vendor_type_code text,
  qbo_vendor_type_id text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

-- per-entity composite uniques (mirror AF-3 catalogs.classes)
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_types_company_name
  ON catalogs.vendor_types (operating_company_id, vendor_type_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_types_company_code
  ON catalogs.vendor_types (operating_company_id, vendor_type_code) WHERE vendor_type_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_types_company_qbo_id
  ON catalogs.vendor_types (operating_company_id, qbo_vendor_type_id) WHERE qbo_vendor_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_types_operating_company_id
  ON catalogs.vendor_types (operating_company_id);

-- composite unique to back the same-entity FK from mdata.vendors
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname = 'uq_vendor_types_company_id' AND conrelid = 'catalogs.vendor_types'::regclass) THEN
    ALTER TABLE catalogs.vendor_types ADD CONSTRAINT uq_vendor_types_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- FORCED entity+role RLS (mirror AF-3 catalogs.classes) -----------------------------------------------------
ALTER TABLE catalogs.vendor_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.vendor_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_types_entity_select ON catalogs.vendor_types;
DROP POLICY IF EXISTS vendor_types_entity_write ON catalogs.vendor_types;
CREATE POLICY vendor_types_entity_select ON catalogs.vendor_types FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY vendor_types_entity_write ON catalogs.vendor_types FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])));

-- grants: SELECT/INSERT/UPDATE only — void-not-delete (deactivated_at). The catalogs schema carries an
-- ALTER DEFAULT PRIVILEGES DELETE grant (0065 landmine), so a narrow GRANT is NOT enough: we must explicitly
-- REVOKE DELETE to make the effective grant match intent. Verified on Neon: effective grant = SELECT/INSERT/UPDATE.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT, INSERT, UPDATE ON catalogs.vendor_types TO ih35_app;
    REVOKE DELETE ON catalogs.vendor_types FROM ih35_app;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_catalogs_vendor_types_updated_at ON catalogs.vendor_types;
CREATE TRIGGER trg_catalogs_vendor_types_updated_at
BEFORE UPDATE ON catalogs.vendor_types
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

-- 2) Seed the 8 canonical system vendor types per company (idempotent; bypass FORCE RLS) ---------------------
DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO catalogs.vendor_types (operating_company_id, vendor_type_name, vendor_type_code, is_system)
  SELECT c.id, v.name, v.code, true
  FROM org.companies c
  CROSS JOIN (VALUES
    ('Fuel', 'FUEL'),
    ('Repair', 'REPAIR'),
    ('Tires', 'TIRES'),
    ('Towing', 'TOWING'),
    ('Insurance', 'INSURANCE'),
    ('Permit', 'PERMIT'),
    ('Toll', 'TOLL'),
    ('Other', 'OTHER')
  ) AS v(name, code)
  ON CONFLICT (operating_company_id, vendor_type_name) DO NOTHING;
END $seed$;

-- 3) LINKAGE — mdata.vendors -> catalogs.vendor_types (same-entity composite FK; keeps vendor_type text) -----
ALTER TABLE mdata.vendors ADD COLUMN IF NOT EXISTS vendor_type_id uuid;
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_type_id
  ON mdata.vendors (vendor_type_id) WHERE vendor_type_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'vendors_vendor_type_same_entity_fkey' AND conrelid = 'mdata.vendors'::regclass)
     AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'mdata' AND table_name = 'vendors' AND column_name = 'operating_company_id') THEN
    ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_same_entity_fkey
      FOREIGN KEY (operating_company_id, vendor_type_id)
      REFERENCES catalogs.vendor_types (operating_company_id, id);
  END IF;
END $$;

-- 4) Backfill the new FK from the existing vendor_type text (idempotent, same-entity, graceful) --------------
DO $bf$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  UPDATE mdata.vendors v
     SET vendor_type_id = vt.id
    FROM catalogs.vendor_types vt
   WHERE v.vendor_type_id IS NULL
     AND v.vendor_type IS NOT NULL
     AND vt.operating_company_id = v.operating_company_id
     AND vt.vendor_type_name = v.vendor_type;
END $bf$;

COMMIT;
