BEGIN;

-- 0215_samsara_config_transp_seed.sql
-- Canonicalize integrations.samsara_config shape with additive, idempotent drift capture.
-- Existing deployments may already have legacy columns (id, api_token_encrypted, webhook_secret_encrypted, last_error).
-- This migration preserves those legacy columns for runtime compatibility and adds canonical columns required for DS controls.
-- TRANSP credential seeding is executed via scripts/seed-samsara-transp.mjs to avoid embedding secrets in migration SQL.

CREATE SCHEMA IF NOT EXISTS integrations;

CREATE TABLE IF NOT EXISTS integrations.samsara_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  samsara_org_id text NULL,
  api_token_encrypted bytea NULL,
  webhook_secret_encrypted bytea NULL,
  encrypted_api_token bytea NULL,
  token_key_version integer NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_health_check_at timestamptz,
  last_health_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id)
);

ALTER TABLE integrations.samsara_config
  ADD COLUMN IF NOT EXISTS encrypted_api_token bytea,
  ADD COLUMN IF NOT EXISTS token_key_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_status text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regclass('integrations.samsara_config') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'integrations'
      AND table_name = 'samsara_config'
      AND column_name = 'api_token_encrypted'
  ) THEN
    EXECUTE '
      UPDATE integrations.samsara_config
      SET encrypted_api_token = COALESCE(encrypted_api_token, api_token_encrypted)
      WHERE encrypted_api_token IS NULL
        AND api_token_encrypted IS NOT NULL
    ';
  END IF;
END
$$;

UPDATE integrations.samsara_config
SET token_key_version = 1
WHERE token_key_version IS NULL;

UPDATE integrations.samsara_config
SET last_health_status = 'transient_error'
WHERE last_health_status IN ('error', 'stale');

ALTER TABLE integrations.samsara_config
  DROP CONSTRAINT IF EXISTS samsara_config_last_health_status_check;

ALTER TABLE integrations.samsara_config
  ADD CONSTRAINT samsara_config_last_health_status_check
  CHECK (
    last_health_status IS NULL
    OR last_health_status IN ('ok', 'auth_failed', 'rate_limited', 'transient_error', 'not_configured')
  );

ALTER TABLE integrations.samsara_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_samsara_config_isolation ON integrations.samsara_config;
DROP POLICY IF EXISTS samsara_config_company_scope ON integrations.samsara_config;
CREATE POLICY samsara_config_company_scope
  ON integrations.samsara_config
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_config TO ih35_app;

COMMIT;
