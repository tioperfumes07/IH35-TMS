BEGIN;

CREATE TABLE IF NOT EXISTS insurance.payment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  policy_id uuid NOT NULL REFERENCES insurance.policy(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'reminded', 'paid', 'overdue', 'late_fee_applied')),
  reminded_at timestamptz,
  paid_at timestamptz,
  late_fee_cents bigint NOT NULL DEFAULT 0 CHECK (late_fee_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_payment_schedule_tenant_due_date
  ON insurance.payment_schedule (tenant_id, due_date);

CREATE INDEX IF NOT EXISTS idx_insurance_payment_schedule_tenant_status
  ON insurance.payment_schedule (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_insurance_payment_schedule_policy
  ON insurance.payment_schedule (policy_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.payment_schedule TO neondb_owner;
  END IF;
END
$$;

ALTER TABLE insurance.payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.payment_schedule FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_schedule_tenant_scope ON insurance.payment_schedule;
CREATE POLICY payment_schedule_tenant_scope
  ON insurance.payment_schedule
  FOR ALL
  USING (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass() OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_insurance_payment_schedule_updated_at ON insurance.payment_schedule;
CREATE TRIGGER trg_insurance_payment_schedule_updated_at
  BEFORE UPDATE ON insurance.payment_schedule
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.payment_schedule TO ih35_app;

COMMIT;
