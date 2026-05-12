BEGIN;

CREATE TABLE IF NOT EXISTS legal.contract_attorney_review_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contract_template_id uuid NOT NULL REFERENCES legal.contract_templates(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_ip inet,
  consumed_user_agent text,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_attorney_review_tokens_lookup
  ON legal.contract_attorney_review_tokens (operating_company_id, contract_template_id, expires_at DESC);

ALTER TABLE legal.contract_attorney_review_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_legal_contract_attorney_review_tokens_isolation ON legal.contract_attorney_review_tokens;
CREATE POLICY rls_legal_contract_attorney_review_tokens_isolation ON legal.contract_attorney_review_tokens
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON legal.contract_attorney_review_tokens TO ih35_app;

COMMIT;
