BEGIN;

CREATE TABLE IF NOT EXISTS insurance.coi_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  policy_id uuid REFERENCES insurance.policy(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'received', 'expired', 'dismissed')),
  notes text,
  document_url text,
  expires_at date,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_coi_request_tenant_customer
  ON insurance.coi_request (tenant_id, customer_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_insurance_coi_request_tenant_status
  ON insurance.coi_request (tenant_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_insurance_coi_request_tenant_policy
  ON insurance.coi_request (tenant_id, policy_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.coi_request TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE insurance.coi_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.coi_request FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coi_request_tenant_scope ON insurance.coi_request;
CREATE POLICY coi_request_tenant_scope
  ON insurance.coi_request
  FOR ALL
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_insurance_coi_request_updated_at ON insurance.coi_request;
CREATE TRIGGER trg_insurance_coi_request_updated_at
  BEFORE UPDATE ON insurance.coi_request
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.coi_request TO ih35_app;

COMMIT;
