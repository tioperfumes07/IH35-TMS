-- Block B30: maintenance.inspections + maintenance.inspection_photos (DVIR linkage, docs photos)
-- NOTE: GO reserved 0361 for B30; 0361 shipped as A24-8 safety.onboarding_sessions — B30 uses 0362.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  inspection_type text NOT NULL CHECK (inspection_type IN ('annual_dot', 'pre_trip', 'post_trip', 'custom')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'archived')),
  scheduled_date date NULL,
  inspection_date date NULL,
  inspector_name text NULL,
  mileage integer NULL CHECK (mileage IS NULL OR mileage >= 0),
  outcome text NULL CHECK (outcome IS NULL OR outcome IN ('pass', 'fail', 'pending')),
  notes text NOT NULL DEFAULT '',
  defects text[] NOT NULL DEFAULT '{}',
  dvir_submission_id uuid NULL REFERENCES safety.dvir_submissions(id),
  is_ad_hoc boolean NOT NULL DEFAULT false,
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_maint_inspection_dvir_type
    CHECK (
      dvir_submission_id IS NULL
      OR inspection_type IN ('pre_trip', 'post_trip')
    )
);

CREATE INDEX IF NOT EXISTS idx_maint_inspections_company_status
  ON maintenance.inspections (operating_company_id, status, scheduled_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_maint_inspections_unit
  ON maintenance.inspections (unit_id, inspection_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_maint_inspections_dvir
  ON maintenance.inspections (dvir_submission_id)
  WHERE dvir_submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS maintenance.inspection_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES maintenance.inspections(id) ON DELETE RESTRICT,
  docs_file_id uuid NOT NULL REFERENCES docs.files(id),
  caption text NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_maint_inspection_photos_file
  ON maintenance.inspection_photos (inspection_id, docs_file_id);

CREATE INDEX IF NOT EXISTS idx_maint_inspection_photos_inspection
  ON maintenance.inspection_photos (inspection_id, sort_order);

ALTER TABLE maintenance.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.inspection_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_inspections_company_scope ON maintenance.inspections;
CREATE POLICY maint_inspections_company_scope
  ON maintenance.inspections
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS maint_inspection_photos_company_scope ON maintenance.inspection_photos;
CREATE POLICY maint_inspection_photos_company_scope
  ON maintenance.inspection_photos
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.inspections TO ih35_app;
GRANT SELECT, INSERT ON maintenance.inspection_photos TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS maintenance.inspection_photos;
-- DROP TABLE IF EXISTS maintenance.inspections;
