BEGIN;

CREATE TABLE IF NOT EXISTS identity.workflow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code text NOT NULL CHECK (
    action_code IN (
      'WF-064-IDENT-001',
      'WF-064-IDENT-002',
      'WF-064-IDENT-003',
      'WF-064-IDENT-004'
    )
  ),
  status text NOT NULL DEFAULT 'Pending' CHECK (
    status IN ('Pending', 'Approved', 'Rejected')
  ),
  requested_by uuid NOT NULL REFERENCES identity.users(id),
  target_user uuid NOT NULL REFERENCES identity.users(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_requests_status_action
  ON identity.workflow_requests (status, action_code);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_requested_by
  ON identity.workflow_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_target_user
  ON identity.workflow_requests (target_user);

ALTER TABLE identity.workflow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.workflow_requests FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON identity.workflow_requests TO ih35_app;
GRANT USAGE ON SCHEMA audit TO ih35_app;
GRANT EXECUTE ON FUNCTION audit.append_event(TEXT, TEXT, JSONB, UUID, TEXT) TO ih35_app;

DROP POLICY IF EXISTS workflow_requests_select ON identity.workflow_requests;
CREATE POLICY workflow_requests_select
ON identity.workflow_requests
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR requested_by = identity.current_user_id()
  OR target_user = identity.current_user_id()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

DROP POLICY IF EXISTS workflow_requests_insert ON identity.workflow_requests;
CREATE POLICY workflow_requests_insert
ON identity.workflow_requests
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    requested_by = identity.current_user_id()
    AND identity.current_user_id() IS NOT NULL
  )
);

DROP POLICY IF EXISTS workflow_requests_update ON identity.workflow_requests;
CREATE POLICY workflow_requests_update
ON identity.workflow_requests
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR identity.current_user_role() IN ('Owner', 'Administrator')
);

CREATE OR REPLACE FUNCTION identity.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_requests_updated_at ON identity.workflow_requests;
CREATE TRIGGER workflow_requests_updated_at
BEFORE UPDATE ON identity.workflow_requests
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();

COMMIT;
