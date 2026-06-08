-- GAP-58: CAP-8 Samsara engine fault webhooks → auto work orders for severe/critical J1939 SPN codes.
BEGIN;

CREATE SCHEMA IF NOT EXISTS integrations;

CREATE TABLE IF NOT EXISTS integrations.engine_fault_events (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL,
  samsara_event_id TEXT UNIQUE,
  spn_code INTEGER NOT NULL,
  fmi_code INTEGER,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'severe', 'critical')),
  raw_payload JSONB NOT NULL,
  auto_wo_uuid UUID REFERENCES maintenance.work_orders(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_engine_fault_events_vehicle
  ON integrations.engine_fault_events (vehicle_id);

CREATE INDEX IF NOT EXISTS idx_engine_fault_events_received
  ON integrations.engine_fault_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_fault_events_company_severity
  ON integrations.engine_fault_events (operating_company_id, severity, received_at DESC);

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS fault_code TEXT;

COMMENT ON COLUMN maintenance.work_orders.fault_code IS
  'J1939 SPN/FMI fault code when WO originated from engine diagnostic webhook (GAP-58).';

ALTER TABLE integrations.engine_fault_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_fault_events_tenant_scope ON integrations.engine_fault_events;
CREATE POLICY engine_fault_events_tenant_scope ON integrations.engine_fault_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT USAGE ON SCHEMA integrations TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.engine_fault_events TO ih35_app;

COMMIT;
