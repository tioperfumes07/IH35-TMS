BEGIN;

CREATE TABLE IF NOT EXISTS integrations.samsara_remote_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('drivers', 'vehicles')),
  remote_count integer NOT NULL CHECK (remote_count >= 0),
  polled_at timestamptz NOT NULL DEFAULT now(),
  api_response_time_ms integer,
  api_status_code integer,
  collection_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, entity_type, polled_at)
);

CREATE TABLE IF NOT EXISTS integrations.samsara_remote_count_collection_state (
  operating_company_id uuid PRIMARY KEY REFERENCES org.companies(id),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_run_status text NOT NULL DEFAULT 'ok' CHECK (last_run_status IN ('ok', 'failed')),
  last_error_class text CHECK (
    last_error_class IS NULL OR last_error_class IN (
      'auth_failed',
      'rate_limited',
      'transient_error',
      'not_configured'
    )
  ),
  last_error_message text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_samsara_remote_counts_latest
  ON integrations.samsara_remote_counts (operating_company_id, entity_type, polled_at DESC);

CREATE INDEX IF NOT EXISTS ix_samsara_webhook_events_entity_latest
  ON integrations.samsara_webhook_events (operating_company_id, event_type, received_at DESC);

ALTER TABLE integrations.samsara_remote_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.samsara_remote_count_collection_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samsara_remote_counts_company_scope ON integrations.samsara_remote_counts;
CREATE POLICY samsara_remote_counts_company_scope
  ON integrations.samsara_remote_counts
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS samsara_remote_count_collection_state_company_scope ON integrations.samsara_remote_count_collection_state;
CREATE POLICY samsara_remote_count_collection_state_company_scope
  ON integrations.samsara_remote_count_collection_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON integrations.samsara_remote_counts TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_remote_count_collection_state TO ih35_app;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('samsara_remote_count_collected'),
      ('samsara_remote_count_failed'),
      ('samsara_api_rate_limit_hit'),
      ('samsara_auth_failed'),
      ('cron_count_drift_check_skipped_pending_projection')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMIT;
