-- DS-REMEDIATE-7 — Samsara webhook projection state + dedupe.
-- Preserve append-only raw webhook ingestion; projection status is tracked in a sidecar table.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ix_samsara_webhook_events_event_id_dedupe
  ON integrations.samsara_webhook_events (operating_company_id, samsara_event_id)
  WHERE samsara_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integrations.samsara_webhook_projection_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid NOT NULL UNIQUE
    REFERENCES integrations.samsara_webhook_events(id)
    ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  projection_status text NOT NULL DEFAULT 'pending'
    CHECK (projection_status IN ('pending', 'processed', 'dead_lettered', 'permanently_failed')),
  projection_attempts integer NOT NULL DEFAULT 0,
  projection_error text,
  projection_error_class text
    CHECK (
      projection_error_class IS NULL OR
      projection_error_class IN (
        'unsupported_event_type',
        'signature_invalid',
        'malformed_payload',
        'mirror_table_missing',
        'tenant_context_invalid',
        'transient_db_error',
        'fk_violation',
        'other'
      )
    ),
  samsara_event_id text,
  last_projection_attempt_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION integrations.touch_samsara_webhook_projection_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_samsara_webhook_projection_state_touch_updated
  ON integrations.samsara_webhook_projection_state;
CREATE TRIGGER trg_samsara_webhook_projection_state_touch_updated
BEFORE UPDATE ON integrations.samsara_webhook_projection_state
FOR EACH ROW
EXECUTE FUNCTION integrations.touch_samsara_webhook_projection_state_updated_at();

ALTER TABLE integrations.samsara_webhook_projection_state
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS samsara_webhook_projection_state_company_scope
  ON integrations.samsara_webhook_projection_state;
CREATE POLICY samsara_webhook_projection_state_company_scope
  ON integrations.samsara_webhook_projection_state
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS ix_samsara_projection_state_pending
  ON integrations.samsara_webhook_projection_state (operating_company_id, next_retry_at, created_at)
  WHERE projection_status = 'pending';

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_webhook_projection_state TO ih35_app;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('webhook_projection_started'),
      ('webhook_projection_succeeded'),
      ('webhook_projection_dead_lettered'),
      ('webhook_projection_permanently_failed'),
      ('webhook_projection_retry_scheduled'),
      ('cron_no_pending_webhooks')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMIT;
