-- [HOLD-FOR-JORGE — TIER 1] Business-Property Allocation — TX business personal-property tax RENDITION
-- filing model (Compliance module). Handoff §12 item 6 confirmed GAP. Companion accrual/payment poster
-- migration: 202607080310_property_tax_accrual_posting.sql (financial-cluster).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so
--     prod db:migrate skips it. This migration POSTS NOTHING and touches NO money table. ***
--
-- WHAT: the Texas Comptroller Form 50-144 "Business Personal Property Rendition" workflow. A carrier must
-- render (report) the taxable business personal property (fleet tractors/trailers + equipment + assets) it
-- owns as of Jan 1 to the county appraisal district (CAD), by the statutory deadline of April 15 (Tax Code
-- §22.23), extendable in writing to May 15. This builds the filing side ONLY:
--   §1 compliance.appraisal_districts — reference catalog of TX county appraisal districts (the taxing
--      jurisdiction each rendition is filed with). Global reference (not entity-scoped), seeded with the
--      CADs IH35 operates in (Webb/Laredo is home). Inline "+ Add new" supported at runtime.
--   §2 compliance.property_tax_renditions — one rendition header per (entity, tax_year, CAD): status
--      (draft/filed/appealed/settled), due date (April 15 of tax_year, extendable), value basis, the
--      rendered total, and the CAD-assessed tax (drives the accrual poster).
--   §3 compliance.property_tax_rendition_lines — the taxable-property BASIS lines: each links the rendition
--      to a concrete fleet asset (mdata.units tractor / mdata.equipment trailer) or a free-form asset, with
--      its acquisition cost + rendered value. This is the forward+reverse drill node (rendition → asset).
--
-- CONNECTIVITY (Law of the Land §10a): rendition → entity (operating_company_id) → county/appraisal
-- district (appraisal_district_id) → taxable assets (unit_id / equipment_id, basis) → [companion migration]
-- the property-tax accrual JE → payment → audit. Forward + reverse drill.
--
-- Idempotent (IF NOT EXISTS / DROP-CREATE policies / ON CONFLICT DO NOTHING). Money-free. The `compliance`
-- schema already exists and is grant-covered (migration 0065); no new schema. FRESH-DB SAFE: the CAD seed
-- is unconditional reference data; the tables reference org.companies/mdata.units/mdata.equipment which all
-- pre-exist. NEVER RAISEs. void-not-delete (is_active + voided_at). Authored per ih35-financial-migrations +
-- ih35-fmcsa-compliance skills. §3.4 gate: schema change → NEVER self-merge.

BEGIN;

-- ===========================================================================================
-- §1 — Appraisal-district reference catalog (the TX county taxing jurisdiction). GLOBAL reference
--      (shared across entities, like reference.cdl_endorsements) — readable by any authenticated app
--      session; only Owner/Administrator may add/edit. Lives in `compliance` (grant-covered by 0065).
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS compliance.appraisal_districts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state       text NOT NULL DEFAULT 'TX',
  county      text NOT NULL,
  cad_name    text NOT NULL,
  cad_code    text,
  is_seed     boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state, county, cad_name)
);

ALTER TABLE compliance.appraisal_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.appraisal_districts FORCE ROW LEVEL SECURITY;
-- Reference data: any authenticated app session reads; write gated to Owner/Administrator.
DROP POLICY IF EXISTS appraisal_districts_read ON compliance.appraisal_districts;
DROP POLICY IF EXISTS appraisal_districts_write ON compliance.appraisal_districts;
CREATE POLICY appraisal_districts_read ON compliance.appraisal_districts FOR SELECT
  USING (true);
CREATE POLICY appraisal_districts_write ON compliance.appraisal_districts FOR ALL
  USING (identity.is_lucia_bypass()
         OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum]))
  WITH CHECK (identity.is_lucia_bypass()
         OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum]));

GRANT SELECT, INSERT, UPDATE ON compliance.appraisal_districts TO ih35_app;

-- ===========================================================================================
-- §2 — Rendition header. One per (entity, tax_year, CAD). Entity-scoped, FORCED RLS.
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS compliance.property_tax_renditions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id      uuid NOT NULL REFERENCES org.companies(id),
  tax_year                  integer NOT NULL,
  appraisal_district_id     uuid NOT NULL REFERENCES compliance.appraisal_districts(id),
  status                    text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','filed','appealed','settled')),
  value_basis               text NOT NULL DEFAULT 'depreciated_cost'
                              CHECK (value_basis IN ('historical_cost','market_value','depreciated_cost')),
  -- Statutory deadline: April 15 of tax_year (Tax Code §22.23). Extendable in writing to May 15.
  due_date                  date NOT NULL,
  extension_requested       boolean NOT NULL DEFAULT false,
  extended_due_date         date,
  cad_account_number        text,                       -- the CAD property-account no. on the notice
  total_rendered_value_cents bigint NOT NULL DEFAULT 0, -- Σ of the line rendered values
  assessed_tax_cents        bigint,                     -- CAD-assessed tax owed (drives the accrual poster)
  filed_at                  timestamptz,
  filed_by_user_id          uuid,
  notes                     text,
  is_active                 boolean NOT NULL DEFAULT true,
  voided_at                 timestamptz,
  voided_by_user_id         uuid,
  void_reason               text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by_user_id        uuid,
  updated_by_user_id        uuid,
  UNIQUE (operating_company_id, tax_year, appraisal_district_id)
);

CREATE INDEX IF NOT EXISTS property_tax_renditions_opco_year_idx
  ON compliance.property_tax_renditions (operating_company_id, tax_year)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS property_tax_renditions_cad_idx
  ON compliance.property_tax_renditions (appraisal_district_id);

ALTER TABLE compliance.property_tax_renditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.property_tax_renditions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS property_tax_renditions_select ON compliance.property_tax_renditions;
DROP POLICY IF EXISTS property_tax_renditions_write ON compliance.property_tax_renditions;
CREATE POLICY property_tax_renditions_select ON compliance.property_tax_renditions FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY property_tax_renditions_write ON compliance.property_tax_renditions FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY[
               'Owner'::identity.role_enum,'Administrator'::identity.role_enum,
               'Accountant'::identity.role_enum,'Manager'::identity.role_enum,'Safety'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY[
               'Owner'::identity.role_enum,'Administrator'::identity.role_enum,
               'Accountant'::identity.role_enum,'Manager'::identity.role_enum,'Safety'::identity.role_enum])));

GRANT SELECT, INSERT, UPDATE ON compliance.property_tax_renditions TO ih35_app;

-- ===========================================================================================
-- §3 — Rendition BASIS lines. Each row is one taxable asset on the rendition, linked to the concrete
--      fleet asset (mdata.units tractor / mdata.equipment trailer) or free-form. This is the
--      rendition ↔ asset connectivity node (forward: rendition→assets; reverse: asset→its renditions).
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS compliance.property_tax_rendition_lines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  rendition_id           uuid NOT NULL REFERENCES compliance.property_tax_renditions(id) ON DELETE CASCADE,
  unit_id                uuid REFERENCES mdata.units(id),        -- tractor basis (mdata.units)
  equipment_id           uuid REFERENCES mdata.equipment(id),    -- trailer basis (mdata.equipment)
  -- Optional loose link to a fixed-asset row for cost-basis provenance. NOT a hard FK: the
  -- units-vs-accounting.fixed_assets consolidation is an OPEN owner decision (handoff §12) — carrying a
  -- soft uuid avoids pinning to a model that may be retired. The concrete asset link is unit_id/equipment_id.
  fixed_asset_id         uuid,
  asset_description      text NOT NULL,
  asset_category         text CHECK (asset_category IN ('tractor','trailer','equipment','office','other')),
  acquisition_date       date,
  acquisition_cost_cents bigint,
  rendered_value_cents   bigint NOT NULL DEFAULT 0,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid,
  -- At most one concrete fleet link per line (a line is a tractor OR a trailer OR free-form).
  CONSTRAINT property_tax_rendition_lines_one_asset
    CHECK ((unit_id IS NOT NULL)::int + (equipment_id IS NOT NULL)::int <= 1)
);

CREATE INDEX IF NOT EXISTS property_tax_rendition_lines_rendition_idx
  ON compliance.property_tax_rendition_lines (rendition_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS property_tax_rendition_lines_unit_idx
  ON compliance.property_tax_rendition_lines (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS property_tax_rendition_lines_equipment_idx
  ON compliance.property_tax_rendition_lines (equipment_id) WHERE equipment_id IS NOT NULL;

ALTER TABLE compliance.property_tax_rendition_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.property_tax_rendition_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS property_tax_rendition_lines_select ON compliance.property_tax_rendition_lines;
DROP POLICY IF EXISTS property_tax_rendition_lines_write ON compliance.property_tax_rendition_lines;
CREATE POLICY property_tax_rendition_lines_select ON compliance.property_tax_rendition_lines FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY property_tax_rendition_lines_write ON compliance.property_tax_rendition_lines FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY[
               'Owner'::identity.role_enum,'Administrator'::identity.role_enum,
               'Accountant'::identity.role_enum,'Manager'::identity.role_enum,'Safety'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY[
               'Owner'::identity.role_enum,'Administrator'::identity.role_enum,
               'Accountant'::identity.role_enum,'Manager'::identity.role_enum,'Safety'::identity.role_enum])));

GRANT SELECT, INSERT, UPDATE ON compliance.property_tax_rendition_lines TO ih35_app;

-- ===========================================================================================
-- §4 — Seed the appraisal-district reference (TX CADs IH35 operates in; Webb/Laredo is home). Runs under
--      a lucia bypass so FORCE RLS permits the seed regardless of the migration role; ON CONFLICT keeps a
--      re-run a no-op. Additional CADs are added inline at runtime.
-- ===========================================================================================
DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO compliance.appraisal_districts (state, county, cad_name, is_seed)
  VALUES
    ('TX', 'Webb',    'Webb County Appraisal District',    true),  -- Laredo (home base)
    ('TX', 'Bexar',   'Bexar Appraisal District',          true),  -- San Antonio
    ('TX', 'Nueces',  'Nueces County Appraisal District',  true),  -- Corpus Christi
    ('TX', 'Hidalgo', 'Hidalgo County Appraisal District', true),  -- McAllen
    ('TX', 'Cameron', 'Cameron Appraisal District',        true),  -- Brownsville
    ('TX', 'Harris',  'Harris County Appraisal District',  true),  -- Houston
    ('TX', 'Dallas',  'Dallas Central Appraisal District', true),  -- Dallas
    ('TX', 'Tarrant', 'Tarrant Appraisal District',        true),  -- Fort Worth
    ('TX', 'Travis',  'Travis Central Appraisal District', true),  -- Austin
    ('TX', 'El Paso', 'El Paso Central Appraisal District', true)  -- El Paso
  ON CONFLICT (state, county, cad_name) DO NOTHING;
END
$seed$;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   SELECT count(*) FROM compliance.appraisal_districts WHERE is_seed;  -- expect >= 10
--   \d compliance.property_tax_renditions   -- confirm FORCE RLS + the 4 policies + grants to ih35_app
--
-- ROLLBACK (forward-only chain; additive):
--   BEGIN;
--     DROP TABLE IF EXISTS compliance.property_tax_rendition_lines;
--     DROP TABLE IF EXISTS compliance.property_tax_renditions;
--     DROP TABLE IF EXISTS compliance.appraisal_districts;
--   COMMIT;
