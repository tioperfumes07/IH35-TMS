BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS is_quicksave_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quicksave_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quicksave_pending_fields jsonb;

CREATE INDEX IF NOT EXISTS idx_loads_quicksave_draft
  ON mdata.loads (operating_company_id, is_quicksave_draft)
  WHERE is_quicksave_draft = true;

CREATE TABLE IF NOT EXISTS dispatch.load_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  assignment_method text NOT NULL CHECK (assignment_method IN ('full_form', 'quicksave', 'drag_drop', 'auto_reassign')),
  previous_driver_id uuid REFERENCES mdata.drivers(id),
  new_driver_id uuid REFERENCES mdata.drivers(id),
  previous_unit_id uuid REFERENCES mdata.units(id),
  new_unit_id uuid REFERENCES mdata.units(id),
  previous_trailer_id uuid REFERENCES mdata.equipment(id),
  new_trailer_id uuid REFERENCES mdata.equipment(id),
  assigned_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  warnings_acknowledged jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dispatch.load_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_assignment_history_isolation
  ON dispatch.load_assignment_history;
CREATE POLICY rls_assignment_history_isolation
  ON dispatch.load_assignment_history
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_assignment_history_load
  ON dispatch.load_assignment_history (load_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_history_driver
  ON dispatch.load_assignment_history (new_driver_id, assigned_at DESC);

COMMIT;
