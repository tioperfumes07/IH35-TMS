CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.audit_events (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_class TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_uuid UUID NULL,
  source TEXT NULL
);

ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_insert ON audit.audit_events;
CREATE POLICY audit_events_insert
  ON audit.audit_events
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_events_select ON audit.audit_events;
CREATE POLICY audit_events_select
  ON audit.audit_events
  FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION audit.append_event(
  p_event_class TEXT,
  p_severity TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_actor_user_uuid UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uuid UUID;
BEGIN
  INSERT INTO audit.audit_events(event_class, severity, payload, actor_user_uuid, source)
  VALUES (p_event_class, p_severity, COALESCE(p_payload, '{}'::jsonb), p_actor_user_uuid, p_source)
  RETURNING uuid INTO v_uuid;

  RETURN v_uuid;
END;
$$;

REVOKE UPDATE, DELETE ON audit.audit_events FROM PUBLIC;
