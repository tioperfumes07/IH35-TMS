BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.workflow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code text NOT NULL CHECK (
    action_code IN (
      'WF-064-CATAL-001',
      'WF-064-CATAL-002',
      'WF-064-CATAL-003',
      'WF-064-CATAL-004'
    )
  ),
  status text NOT NULL DEFAULT 'Pending' CHECK (
    status IN ('Pending', 'Approved', 'Rejected')
  ),
  requested_by uuid NOT NULL REFERENCES identity.users(id),
  target_resource_type text NOT NULL CHECK (
    target_resource_type IN ('account_role_binding', 'posting_template', 'account', 'qbo_sync')
  ),
  target_resource_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogs.workflow_requests IS
'WF-064 catalog workflow requests. For target_resource_type = qbo_sync, target_resource_id uses sentinel UUID 00000000-0000-0000-0000-000000000000.';

CREATE INDEX IF NOT EXISTS idx_catalogs_workflow_requests_status_action
  ON catalogs.workflow_requests (status, action_code);
CREATE INDEX IF NOT EXISTS idx_catalogs_workflow_requests_requested_by
  ON catalogs.workflow_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_catalogs_workflow_requests_target_resource
  ON catalogs.workflow_requests (target_resource_type, target_resource_id);

ALTER TABLE catalogs.workflow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.workflow_requests FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON catalogs.workflow_requests TO ih35_app;

DROP POLICY IF EXISTS catal_wf_select ON catalogs.workflow_requests;
CREATE POLICY catal_wf_select
ON catalogs.workflow_requests
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR requested_by = identity.current_user_id()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP POLICY IF EXISTS catal_wf_insert ON catalogs.workflow_requests;
CREATE POLICY catal_wf_insert
ON catalogs.workflow_requests
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    requested_by = identity.current_user_id()
    AND identity.current_user_id() IS NOT NULL
  )
);

DROP POLICY IF EXISTS catal_wf_update ON catalogs.workflow_requests;
CREATE POLICY catal_wf_update
ON catalogs.workflow_requests
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP TRIGGER IF EXISTS trg_catalogs_workflow_requests_updated_at ON catalogs.workflow_requests;
CREATE TRIGGER trg_catalogs_workflow_requests_updated_at
BEFORE UPDATE ON catalogs.workflow_requests
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

COMMIT;
