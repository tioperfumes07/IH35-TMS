CREATE TABLE IF NOT EXISTS qa.policy (id uuid, tenant_id uuid, status text);
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_tenant_id
    ON qa.policy (tenant_id, id);
  CREATE INDEX IF NOT EXISTS idx_policy_status ON qa.policy (status);
END $$;
