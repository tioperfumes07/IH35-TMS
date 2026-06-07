-- GAP-61 / CAP-11: fuel card fraud alerts
BEGIN;

CREATE TABLE IF NOT EXISTS fuel.fraud_alerts (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  fuel_transaction_uuid uuid NOT NULL REFERENCES fuel.fuel_transactions(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'investigating', 'dismissed', 'confirmed_fraud', 'recovered')
  ),
  investigated_by_user_uuid uuid NULL REFERENCES identity.users(id),
  investigated_at timestamptz NULL,
  resolution_notes text NULL,
  resolved_at timestamptz NULL,
  CONSTRAINT chk_fraud_alerts_evidence_object CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fraud_alerts_txn_rule
  ON fuel.fraud_alerts (operating_company_id, fuel_transaction_uuid, rule_id);

CREATE INDEX IF NOT EXISTS idx_fraud_status
  ON fuel.fraud_alerts (operating_company_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_open_critical
  ON fuel.fraud_alerts (operating_company_id, detected_at DESC)
  WHERE severity = 'critical' AND resolved_at IS NULL;

ALTER TABLE fuel.fraud_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_fraud_alerts_company_isolation ON fuel.fraud_alerts;
CREATE POLICY fuel_fraud_alerts_company_isolation ON fuel.fraud_alerts
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON fuel.fraud_alerts TO ih35_app;

COMMIT;
