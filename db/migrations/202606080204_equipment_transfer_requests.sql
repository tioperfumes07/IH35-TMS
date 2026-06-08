-- GAP-37: WF-047 equipment dual-confirm transfer requests (G14)
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.equipment_transfer_requests (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  equipment_uuid uuid NOT NULL,
  equipment_kind text NOT NULL CHECK (equipment_kind IN ('truck', 'trailer', 'chassis')),
  from_driver_uuid uuid REFERENCES mdata.drivers(id),
  to_driver_uuid uuid REFERENCES mdata.drivers(id),
  initiated_by_user_uuid uuid NOT NULL REFERENCES identity.users(id),
  transfer_location text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('pending_outbound', 'outbound_confirmed', 'inbound_confirmed', 'completed', 'cancelled')
  ),
  outbound_confirmed_at timestamptz,
  outbound_evidence_uuid uuid,
  inbound_confirmed_at timestamptz,
  inbound_evidence_uuid uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etr_equipment ON dispatch.equipment_transfer_requests (equipment_uuid);
CREATE INDEX IF NOT EXISTS idx_etr_status ON dispatch.equipment_transfer_requests (status);
CREATE INDEX IF NOT EXISTS idx_etr_company_status ON dispatch.equipment_transfer_requests (operating_company_id, status, created_at DESC);

ALTER TABLE dispatch.equipment_transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_transfer_requests_company_scope ON dispatch.equipment_transfer_requests;
CREATE POLICY equipment_transfer_requests_company_scope
  ON dispatch.equipment_transfer_requests
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.equipment_transfer_requests TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dispatch TO ih35_app;

COMMIT;
