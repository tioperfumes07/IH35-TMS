BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.auto_status_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  suggested_from text NOT NULL,
  suggested_to text NOT NULL,
  reason text NOT NULL,
  suggested_at timestamptz NOT NULL DEFAULT now(),
  user_response text NULL CHECK (user_response IN ('confirmed', 'overridden', 'dismissed', 'expired')),
  response_at timestamptz NULL,
  response_by_user_uuid uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_auto_status_suggestions_company_recent
  ON dispatch.auto_status_suggestions (operating_company_id, suggested_at DESC);

CREATE TABLE IF NOT EXISTS dispatch.auto_status_suggestion_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  suggestion_id uuid NOT NULL REFERENCES dispatch.auto_status_suggestions(id),
  response text NOT NULL CHECK (response IN ('confirmed', 'overridden', 'dismissed', 'expired')),
  response_at timestamptz NOT NULL DEFAULT now(),
  response_by_user_uuid uuid NOT NULL REFERENCES identity.users(id),
  note text NULL
);

CREATE INDEX IF NOT EXISTS ix_auto_status_suggestion_responses_company
  ON dispatch.auto_status_suggestion_responses (operating_company_id, suggestion_id, response_at DESC);

CREATE OR REPLACE FUNCTION dispatch.block_auto_status_suggestions_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dispatch.auto_status_suggestions is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_status_suggestions_block_update ON dispatch.auto_status_suggestions;
CREATE TRIGGER trg_auto_status_suggestions_block_update
BEFORE UPDATE ON dispatch.auto_status_suggestions
FOR EACH ROW
EXECUTE FUNCTION dispatch.block_auto_status_suggestions_mutation();

DROP TRIGGER IF EXISTS trg_auto_status_suggestions_block_delete ON dispatch.auto_status_suggestions;
CREATE TRIGGER trg_auto_status_suggestions_block_delete
BEFORE DELETE ON dispatch.auto_status_suggestions
FOR EACH ROW
EXECUTE FUNCTION dispatch.block_auto_status_suggestions_mutation();

ALTER TABLE dispatch.auto_status_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.auto_status_suggestion_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_auto_status_suggestions_company ON dispatch.auto_status_suggestions;
CREATE POLICY rls_auto_status_suggestions_company
ON dispatch.auto_status_suggestions
FOR ALL TO ih35_app
USING (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

DROP POLICY IF EXISTS rls_auto_status_suggestion_responses_company ON dispatch.auto_status_suggestion_responses;
CREATE POLICY rls_auto_status_suggestion_responses_company
ON dispatch.auto_status_suggestion_responses
FOR ALL TO ih35_app
USING (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

REVOKE UPDATE, DELETE ON dispatch.auto_status_suggestions FROM PUBLIC;
REVOKE UPDATE, DELETE ON dispatch.auto_status_suggestions FROM ih35_app;

GRANT SELECT, INSERT ON dispatch.auto_status_suggestions TO ih35_app;
GRANT SELECT, INSERT ON dispatch.auto_status_suggestion_responses TO ih35_app;

COMMIT;
