-- Block A19: reefer hours separate tracking (reefer_hours_log + reefer_specs)
-- NOTE: GO reserved 0359 for A19; 0359 shipped as RLS defensive — A19 uses 0366. 0364 reserved for B35 KPI dashboard.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.reefer_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id) ON DELETE CASCADE,
  reefer_brand text NOT NULL DEFAULT '',
  service_interval_hours integer NOT NULL DEFAULT 2000 CHECK (service_interval_hours > 0),
  last_service_hours numeric NULL CHECK (last_service_hours IS NULL OR last_service_hours >= 0),
  last_service_date date NULL,
  notes text NOT NULL DEFAULT '',
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_maint_reefer_specs_equipment_active
  ON maintenance.reefer_specs (operating_company_id, equipment_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maint_reefer_specs_company
  ON maintenance.reefer_specs (operating_company_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS maintenance.reefer_hours_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id) ON DELETE CASCADE,
  hours_reading numeric NOT NULL CHECK (hours_reading >= 0),
  source text NOT NULL CHECK (source IN ('samsara', 'manual')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT '',
  samsara_event_id text NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  archived_at timestamptz NULL,
  archive_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_reefer_hours_log_equipment_recorded
  ON maintenance.reefer_hours_log (equipment_id, recorded_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maint_reefer_hours_log_company_recorded
  ON maintenance.reefer_hours_log (operating_company_id, recorded_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE maintenance.reefer_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.reefer_hours_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_reefer_specs_company_scope ON maintenance.reefer_specs;
CREATE POLICY maint_reefer_specs_company_scope
  ON maintenance.reefer_specs
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS maint_reefer_hours_log_company_scope ON maintenance.reefer_hours_log;
CREATE POLICY maint_reefer_hours_log_company_scope
  ON maintenance.reefer_hours_log
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.reefer_specs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.reefer_hours_log TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS maintenance.reefer_hours_log;
-- DROP TABLE IF EXISTS maintenance.reefer_specs;
