CREATE TABLE IF NOT EXISTS qa.policy (id uuid, tenant_id uuid, status text);
CREATE INDEX IF NOT EXISTS idx_policy_tenant_status ON qa.policy (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_status ON qa.policy (status);
