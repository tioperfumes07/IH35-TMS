-- 202615201000_customer_aliases.sql -- ROUND 326 item 1 (claim #23940).
-- Canonical-customer engine. Owner law 2026-10-02: no cancelled shells -- a merged duplicate customer is DELETED
-- after every reference is repointed to the canonical record. What the merge removes is kept HERE, so nothing is
-- lost and every merge is reversible:
--   alias_name / alias_normalized  -- the duplicate's name (lookups by an old name still find the customer)
--   merged_customer_id             -- the deleted row's id (no FK: the row is gone; reversal recreates it)
--   snapshot                       -- the full deleted mdata.customers row (to_jsonb)
--   repoint_log                    -- every table/column/row id moved to the canonical id, so reversal is exact
-- Entity-scoped (operating_company_id); FORCED RLS. Additive.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS mdata.customer_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  canonical_customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  alias_name text NOT NULL,
  alias_normalized text NOT NULL,
  merged_customer_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  repoint_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_at timestamptz NOT NULL DEFAULT now(),
  merged_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  auth_id text NULL,
  reversed_at timestamptz NULL,
  reversed_by_user_id uuid NULL REFERENCES identity.users(id),
  CONSTRAINT customer_aliases_one_per_merged UNIQUE (merged_customer_id)
);
CREATE INDEX IF NOT EXISTS customer_aliases_canonical_idx ON mdata.customer_aliases (canonical_customer_id);
CREATE INDEX IF NOT EXISTS customer_aliases_normalized_idx ON mdata.customer_aliases (operating_company_id, alias_normalized);

ALTER TABLE mdata.customer_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.customer_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_aliases_company_isolation ON mdata.customer_aliases;
CREATE POLICY customer_aliases_company_isolation ON mdata.customer_aliases
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON mdata.customer_aliases TO ih35_app;

COMMENT ON TABLE mdata.customer_aliases IS
  'ROUND 326: merged duplicate customers -- name, snapshot of the deleted row and the exact repoint log, so a merge is reversible and an old name still resolves to the canonical customer.';

COMMIT;
