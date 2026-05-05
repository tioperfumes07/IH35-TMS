BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.driver_termination_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID
);

COMMENT ON TABLE catalogs.driver_termination_reasons IS 'Catalog of termination/separation reasons used in driver_safety_events when event_type=termination. Admin-editable. Severity influences how returning-driver detection presents the warning.';

CREATE INDEX IF NOT EXISTS idx_driver_termination_reasons_active
  ON catalogs.driver_termination_reasons (is_active, severity)
  WHERE deactivated_at IS NULL;

INSERT INTO catalogs.driver_termination_reasons (code, label, description, severity) VALUES
  ('fired_aggressive', 'Fired - Aggressive behavior', 'Terminated for aggressive behavior toward staff, customers, or other drivers', 'severe'),
  ('fired_bad_attitude', 'Fired - Bad attitude / insubordination', 'Terminated for repeated insubordination or persistent bad attitude affecting operations', 'warning'),
  ('fired_accident_at_fault', 'Fired - At-fault accident', 'Terminated due to at-fault accident (preventable per insurance review)', 'severe'),
  ('fired_accident_not_at_fault', 'Fired - Not-at-fault accident', 'Terminated following a not-at-fault accident (rare; usually for handling the aftermath)', 'warning'),
  ('fired_refused_route', 'Fired - Refused dispatched route', 'Terminated for refusing dispatched routes/regions multiple times', 'warning'),
  ('quit_voluntary', 'Quit - Voluntary departure', 'Driver chose to leave; gave proper notice', 'info'),
  ('abandoned_load', 'Abandoned load', 'Driver abandoned a load mid-trip without authorization. Highest severity. Triggers escrow deduction in Phase 5.', 'severe'),
  ('accepted_and_left', 'Accepted load and left before completion', 'Accepted dispatched load then walked away before completing pickup or delivery', 'severe'),
  ('no_call_no_show', 'No call / no show', 'Did not report for assigned dispatch without notice', 'severe'),
  ('failed_drug_test', 'Failed drug test', 'Failed DOT-mandated drug or alcohol test', 'severe'),
  ('dot_violation', 'DOT violation', 'Major DOT compliance violation (HOS falsification, logbook fraud, etc.)', 'severe'),
  ('cdl_revoked', 'CDL revoked or suspended', 'Lost commercial driving privileges', 'severe'),
  ('dui_criminal', 'DUI / criminal charge', 'DUI conviction or criminal charge affecting fitness to drive', 'severe'),
  ('end_of_contract', 'End of contract / mutual agreement', 'Contract ended by mutual agreement; no fault', 'info'),
  ('retired', 'Retired', 'Driver retired from commercial driving', 'info'),
  ('medical', 'Medical - unable to drive', 'Medical condition prevents continued commercial driving', 'info')
ON CONFLICT (code) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON catalogs.driver_termination_reasons TO ih35_app;
ALTER TABLE catalogs.driver_termination_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.driver_termination_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dtr_select_authenticated ON catalogs.driver_termination_reasons;
CREATE POLICY dtr_select_authenticated ON catalogs.driver_termination_reasons
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS dtr_modify_owner_only ON catalogs.driver_termination_reasons;
CREATE POLICY dtr_modify_owner_only ON catalogs.driver_termination_reasons
  FOR ALL TO ih35_app
  USING (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

CREATE TABLE IF NOT EXISTS mdata.driver_safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('termination', 'incident', 'complaint', 'commendation', 'dispute')),
  event_date DATE NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  summary TEXT NOT NULL,
  details TEXT,
  termination_reason_id UUID REFERENCES catalogs.driver_termination_reasons(id) ON DELETE RESTRICT,
  related_load_id UUID,
  document_ids UUID[],
  curp_snapshot TEXT,
  cdl_number_snapshot TEXT,
  cdl_state_snapshot TEXT,
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID,
  CONSTRAINT termination_reason_required_for_termination
    CHECK (event_type <> 'termination' OR termination_reason_id IS NOT NULL),
  CONSTRAINT void_consistency
    CHECK (
      (voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
      OR
      (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_driver_safety_events_driver
  ON mdata.driver_safety_events (driver_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_driver_safety_events_curp
  ON mdata.driver_safety_events (curp_snapshot)
  WHERE curp_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_safety_events_cdl
  ON mdata.driver_safety_events (cdl_number_snapshot, cdl_state_snapshot)
  WHERE cdl_number_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_safety_events_severe
  ON mdata.driver_safety_events (driver_id, severity)
  WHERE severity = 'severe' AND voided_at IS NULL;

COMMENT ON TABLE mdata.driver_safety_events IS 'Permanent append-only safety events per driver. Records cannot be deleted, only voided (with reason). Indexed by CURP and CDL+state for returning-driver detection across rehires. Ensures institutional memory survives multiple driver stints.';
COMMENT ON COLUMN mdata.driver_safety_events.curp_snapshot IS 'CURP at time of event. Snapshotted because driver record may be updated/deleted; safety event carries identity for cross-rehire detection.';
COMMENT ON COLUMN mdata.driver_safety_events.cdl_number_snapshot IS 'CDL number at time of event. Used for US driver returning detection (CDL+state).';
COMMENT ON COLUMN mdata.driver_safety_events.related_load_id IS 'Phase 3: links to mdata.loads when load is involved (abandonment, accident on load, etc.). FK not added in Phase 1 since loads table does not exist yet.';
COMMENT ON COLUMN mdata.driver_safety_events.document_ids IS 'Phase 2: array of FK to docs.files. No FK constraint in Phase 1 since docs schema does not exist yet.';

GRANT SELECT, INSERT, UPDATE ON mdata.driver_safety_events TO ih35_app;
ALTER TABLE mdata.driver_safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_safety_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dse_select_safety_roles ON mdata.driver_safety_events;
CREATE POLICY dse_select_safety_roles ON mdata.driver_safety_events
  FOR SELECT TO ih35_app
  USING (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Safety')
    OR identity.is_lucia_bypass()
  );

DROP POLICY IF EXISTS dse_insert_owner_only ON mdata.driver_safety_events;
CREATE POLICY dse_insert_owner_only ON mdata.driver_safety_events
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

DROP POLICY IF EXISTS dse_update_owner_only ON mdata.driver_safety_events;
CREATE POLICY dse_update_owner_only ON mdata.driver_safety_events
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

COMMIT;
