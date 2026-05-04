BEGIN;

CREATE TABLE IF NOT EXISTS mdata.workflow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code text NOT NULL CHECK (
    action_code IN (
      'WF-064-MDATA-001',
      'WF-064-MDATA-002',
      'WF-064-MDATA-003',
      'WF-064-MDATA-004',
      'WF-064-MDATA-005'
    )
  ),
  status text NOT NULL DEFAULT 'Pending' CHECK (
    status IN ('Pending', 'Approved', 'Rejected')
  ),
  requested_by uuid NOT NULL REFERENCES identity.users(id),
  target_resource_type text NOT NULL CHECK (
    target_resource_type IN ('driver', 'unit', 'equipment')
  ),
  target_resource_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mdata_workflow_requests_status_action
  ON mdata.workflow_requests (status, action_code);
CREATE INDEX IF NOT EXISTS idx_mdata_workflow_requests_requested_by
  ON mdata.workflow_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_mdata_workflow_requests_target_resource
  ON mdata.workflow_requests (target_resource_type, target_resource_id);

ALTER TABLE mdata.workflow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.workflow_requests FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.workflow_requests TO ih35_app;

DROP POLICY IF EXISTS mdata_wf_select ON mdata.workflow_requests;
CREATE POLICY mdata_wf_select
ON mdata.workflow_requests
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR requested_by = identity.current_user_id()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP POLICY IF EXISTS mdata_wf_insert ON mdata.workflow_requests;
CREATE POLICY mdata_wf_insert
ON mdata.workflow_requests
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    requested_by = identity.current_user_id()
    AND identity.current_user_id() IS NOT NULL
  )
);

DROP POLICY IF EXISTS mdata_wf_update ON mdata.workflow_requests;
CREATE POLICY mdata_wf_update
ON mdata.workflow_requests
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP TRIGGER IF EXISTS mdata_workflow_requests_updated_at ON mdata.workflow_requests;
CREATE TRIGGER mdata_workflow_requests_updated_at
BEFORE UPDATE ON mdata.workflow_requests
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

COMMIT;
