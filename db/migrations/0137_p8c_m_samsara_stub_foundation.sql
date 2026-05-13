BEGIN;

-- Block M PR1 v2 — Samsara integration stub (config + mappings + webhook log).
-- Agent-2 odd series. Post-MVP: replace SamsaraClient with live API.

CREATE SCHEMA IF NOT EXISTS integrations;

CREATE OR REPLACE FUNCTION integrations.touch_samsara_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS integrations.samsara_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  samsara_org_id text NULL,
  api_token_encrypted bytea NULL,
  webhook_secret_encrypted bytea NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  last_health_check_at timestamptz NULL,
  last_health_status text NULL
    CHECK (last_health_status IS NULL OR last_health_status IN ('ok', 'error', 'not_configured', 'stale')),
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id)
);

DROP TRIGGER IF EXISTS trg_samsara_config_touch_updated ON integrations.samsara_config;
CREATE TRIGGER trg_samsara_config_touch_updated
BEFORE UPDATE ON integrations.samsara_config
FOR EACH ROW
EXECUTE FUNCTION integrations.touch_samsara_config_updated_at();

CREATE INDEX IF NOT EXISTS idx_samsara_config_company_enabled
  ON integrations.samsara_config (operating_company_id, is_enabled)
  WHERE is_enabled = true;

ALTER TABLE integrations.samsara_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_samsara_config_isolation ON integrations.samsara_config;
CREATE POLICY rls_samsara_config_isolation ON integrations.samsara_config
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE TABLE IF NOT EXISTS integrations.samsara_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  samsara_driver_id text NOT NULL,
  local_driver_id uuid NULL REFERENCES mdata.drivers(id),
  raw_payload jsonb NULL,
  last_seen_at timestamptz NULL,
  UNIQUE (operating_company_id, samsara_driver_id)
);

CREATE INDEX IF NOT EXISTS idx_samsara_drivers_company
  ON integrations.samsara_drivers (operating_company_id, last_seen_at DESC NULLS LAST);

ALTER TABLE integrations.samsara_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_samsara_drivers_isolation ON integrations.samsara_drivers;
CREATE POLICY rls_samsara_drivers_isolation ON integrations.samsara_drivers
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE TABLE IF NOT EXISTS integrations.samsara_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  samsara_vehicle_id text NOT NULL,
  local_unit_id uuid NULL REFERENCES mdata.units(id),
  raw_payload jsonb NULL,
  last_seen_at timestamptz NULL,
  UNIQUE (operating_company_id, samsara_vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_samsara_vehicles_company
  ON integrations.samsara_vehicles (operating_company_id, last_seen_at DESC NULLS LAST);

ALTER TABLE integrations.samsara_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_samsara_vehicles_isolation ON integrations.samsara_vehicles;
CREATE POLICY rls_samsara_vehicles_isolation ON integrations.samsara_vehicles
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE TABLE IF NOT EXISTS integrations.samsara_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  samsara_event_id text NULL,
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NULL,
  processing_error text NULL
);

CREATE INDEX IF NOT EXISTS idx_samsara_webhook_events_company_time
  ON integrations.samsara_webhook_events (operating_company_id, received_at DESC);

CREATE OR REPLACE FUNCTION integrations.block_samsara_webhook_events_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'integrations.samsara_webhook_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_samsara_webhook_events_update ON integrations.samsara_webhook_events;
CREATE TRIGGER trg_block_samsara_webhook_events_update
BEFORE UPDATE ON integrations.samsara_webhook_events
FOR EACH ROW
EXECUTE FUNCTION integrations.block_samsara_webhook_events_mutate();

DROP TRIGGER IF EXISTS trg_block_samsara_webhook_events_delete ON integrations.samsara_webhook_events;
CREATE TRIGGER trg_block_samsara_webhook_events_delete
BEFORE DELETE ON integrations.samsara_webhook_events
FOR EACH ROW
EXECUTE FUNCTION integrations.block_samsara_webhook_events_mutate();

REVOKE UPDATE, DELETE ON integrations.samsara_webhook_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON integrations.samsara_webhook_events FROM ih35_app;

ALTER TABLE integrations.samsara_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_samsara_webhook_events_isolation ON integrations.samsara_webhook_events;
CREATE POLICY rls_samsara_webhook_events_isolation ON integrations.samsara_webhook_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('views') IS NOT NULL THEN
    EXECUTE $V$
      CREATE OR REPLACE VIEW views.integrations_samsara_config_v
      WITH (security_invoker = true) AS
      SELECT
        id,
        operating_company_id,
        samsara_org_id,
        is_enabled,
        last_health_check_at,
        last_health_status,
        last_error,
        created_at,
        updated_at
      FROM integrations.samsara_config
    $V$;

    EXECUTE $V$
      CREATE OR REPLACE VIEW views.integrations_samsara_drivers_v
      WITH (security_invoker = true) AS
      SELECT
        id,
        operating_company_id,
        samsara_driver_id,
        local_driver_id,
        last_seen_at,
        (raw_payload IS NOT NULL) AS has_raw_payload
      FROM integrations.samsara_drivers
    $V$;

    EXECUTE $V$
      CREATE OR REPLACE VIEW views.integrations_samsara_vehicles_v
      WITH (security_invoker = true) AS
      SELECT
        id,
        operating_company_id,
        samsara_vehicle_id,
        local_unit_id,
        last_seen_at,
        (raw_payload IS NOT NULL) AS has_raw_payload
      FROM integrations.samsara_vehicles
    $V$;

    EXECUTE $V$
      CREATE OR REPLACE VIEW views.integrations_samsara_webhook_events_v
      WITH (security_invoker = true) AS
      SELECT
        id,
        operating_company_id,
        received_at,
        event_type,
        samsara_event_id,
        signature_valid,
        processed_at,
        processing_error
      FROM integrations.samsara_webhook_events
    $V$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regnamespace('integrations') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA integrations TO ih35_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.samsara_drivers TO ih35_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.samsara_vehicles TO ih35_app;
    GRANT SELECT, INSERT ON integrations.samsara_webhook_events TO ih35_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.samsara_config TO ih35_app;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('integrations.samsara_config_created'),
      ('integrations.samsara_config_updated'),
      ('integrations.samsara_config_disabled'),
      ('integrations.samsara_webhook_received'),
      ('integrations.samsara_webhook_signature_invalid')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMIT;
