-- GO-21 B3 — historical import reason catalog. Mirrors catalogs.detention_reasons exactly (same
-- column shape, same FORCED RLS company_scope + lucia_bypass policies, same grant set) — this
-- table is served by the SAME generic dispatch-catalog route factory
-- (apps/backend/src/catalogs/dispatch/shared.ts registerDispatchCatalogCrudRoutes), just a new
-- tableName. Backs the Book Load "Historical import reason" quick-pick catalog: the free-text
-- historical_import_reason column on mdata.loads (and its Owner-only audited create path in
-- book-load.service.ts) is UNCHANGED by this migration -- the catalog only supplies canned reason
-- TEXT the office can pick then refine, exactly like the existing "Customer reference lookup"
-- quick-pick pattern in BookLoadCustomerSection.tsx. No FK added to mdata.loads.
--
-- Content authored by CC-3 (chrome-only lane, permanently banned from db/migrations/*.sql
-- authorship by verify-migration-lane-band.mjs) -- validated twice on a disposable Neon branch,
-- applied directly to prod by CC-3, handed off to CC-1 for ledger-file authorship per the
-- established handoff pattern used this session for GO-19-09 / GO-20-B / DRIVER-F7334.

CREATE TABLE IF NOT EXISTS catalogs.historical_import_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_import_reasons_operating_company_id_code_key UNIQUE (operating_company_id, code),
  CONSTRAINT historical_import_reasons_id_company_unique UNIQUE (id, operating_company_id)
);

CREATE INDEX IF NOT EXISTS idx_historical_import_reasons_company_active
  ON catalogs.historical_import_reasons (operating_company_id, is_active);

ALTER TABLE catalogs.historical_import_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.historical_import_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_scope ON catalogs.historical_import_reasons;
CREATE POLICY company_scope ON catalogs.historical_import_reasons
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS historical_import_reasons_lucia_bypass ON catalogs.historical_import_reasons;
CREATE POLICY historical_import_reasons_lucia_bypass ON catalogs.historical_import_reasons
  FOR SELECT
  USING (identity.is_lucia_bypass());

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.historical_import_reasons TO ih35_app;

-- Seed a small starter set per active company so the picker is not empty on day one -- office adds
-- more via the picker's own "+ Add new" (same generic-catalog create route this seed exercises).
INSERT INTO catalogs.historical_import_reasons (operating_company_id, code, display_name, sort_order)
SELECT c.id, v.code, v.display_name, v.sort_order
FROM org.companies c
CROSS JOIN (VALUES
  ('ALWAYSTRACK-LEGACY', 'AlwaysTrack legacy load -- driver record migrated from the prior system', 10),
  ('DRIVER-TERMINATED-POST-DISPATCH', 'Driver was terminated after this load was dispatched', 20),
  ('DATA-MIGRATION-CORRECTION', 'Data migration correction -- original driver record is now inactive', 30)
) AS v(code, display_name, sort_order)
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;
