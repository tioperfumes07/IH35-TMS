-- Block 4 (COA-DETAILTYPE-01): make Detail Type manageable per-entity WITHOUT commingling.
-- Tier-1 (catalogs.* schema). Extends the EXISTING seeded catalogs.detail_types (144 canonical
-- QBO rows, migration 202606080010) rather than creating a duplicate account_detail_types table.
--
-- Model (documented per dispatch): Account Type stays the fixed GLOBAL system taxonomy
-- (catalogs.account_types, read-only). Detail Type is now:
--   • canonical rows  = is_system=true, operating_company_id NULL, visible to ALL entities, immutable;
--   • custom rows      = per-entity (operating_company_id set), is_system=false, entity-editable.
-- QBO: Detail Type is fixed per Account Type. NetSuite: custom types allowed. McLeod: GL sub-class.
-- We take the union — canonical seed + per-entity custom — matching NetSuite's flexibility while
-- keeping QBO's canonical set immutable. account_types is a GLOBAL reference (no operating_company_id),
-- so detail_types.account_type_id is a same-catalog FK to that shared taxonomy (no entity commingling:
-- the ENTITY boundary is on detail_types.operating_company_id, not on the shared type).
--
-- Idempotent / forward-only / fresh-DB safe.

BEGIN;

-- (1) Per-entity + descriptive columns. NULL operating_company_id = global/system row.
ALTER TABLE catalogs.detail_types
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- (2) Seal every pre-existing (canonical, QBO-seeded) row as an immutable system row.
UPDATE catalogs.detail_types
  SET is_system = true
  WHERE operating_company_id IS NULL AND is_system = false;

-- (3) A custom detail-type code is unique within (entity, account_type). System rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_detail_types_entity_code
  ON catalogs.detail_types (operating_company_id, account_type_id, lower(code))
  WHERE operating_company_id IS NOT NULL AND code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_detail_types_company_type
  ON catalogs.detail_types (operating_company_id, account_type_id, sort_order);

-- (4) RLS. System rows (opco NULL) are visible to EVERY entity (so the existing account-type read
--     route and the CoA creator keep seeing the canonical set); custom rows are entity-scoped.
--     Writes are restricted to the caller's own NON-system rows — is_system rows are seed-locked.
ALTER TABLE catalogs.detail_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.detail_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detail_types_read ON catalogs.detail_types;
CREATE POLICY detail_types_read ON catalogs.detail_types
  FOR SELECT TO ih35_app
  USING (operating_company_id IS NULL OR operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS detail_types_write ON catalogs.detail_types;
CREATE POLICY detail_types_write ON catalogs.detail_types
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true) AND is_system = false)
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true) AND is_system = false);

GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.detail_types TO ih35_app;

COMMIT;
