-- P7 Wave 2 v3 — integrations.qbo_inbound_events (QBO webhook + CDC ingestion ledger).

BEGIN;

CREATE TABLE IF NOT EXISTS integrations.qbo_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_realm_id text NOT NULL,
  webhook_signature_valid boolean NOT NULL DEFAULT false,
  qbo_event_type text,
  qbo_entity_type text,
  qbo_entity_id text,
  qbo_last_updated_at timestamptz,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'fetched', 'applied', 'conflict', 'error', 'duplicate')),
  payload_raw jsonb NOT NULL,
  error_message text,
  applied_to_tms_entity_table text,
  applied_to_tms_entity_id uuid,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_inbound_events_company_status_received
  ON integrations.qbo_inbound_events (operating_company_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_qbo_inbound_events_realm_entity_updated
  ON integrations.qbo_inbound_events (qbo_realm_id, qbo_entity_id, qbo_last_updated_at);

ALTER TABLE integrations.qbo_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.qbo_inbound_events FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON integrations.qbo_inbound_events TO ih35_app;

DROP POLICY IF EXISTS qbo_inbound_events_select_office ON integrations.qbo_inbound_events;
CREATE POLICY qbo_inbound_events_select_office ON integrations.qbo_inbound_events
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Accountant'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS qbo_inbound_events_insert_worker ON integrations.qbo_inbound_events;
CREATE POLICY qbo_inbound_events_insert_worker ON integrations.qbo_inbound_events
  FOR INSERT TO ih35_app
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS qbo_inbound_events_update_worker ON integrations.qbo_inbound_events;
CREATE POLICY qbo_inbound_events_update_worker ON integrations.qbo_inbound_events
  FOR UPDATE TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

COMMIT;
