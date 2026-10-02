-- 202615201100_vendor_aliases.sql -- ROUND 326 item 2 (claim #23940). mdata.vendors is canonical; mdata.qbo_vendors is never written.
-- Canonical-vendor engine. Owner law 2026-10-02: no cancelled shells -- a merged duplicate vendor is DELETED
-- after every reference is repointed to the canonical record. What the merge removes is kept HERE, so nothing is
-- lost and every merge is reversible:
--   alias_name / alias_normalized  -- the duplicate's name (lookups by an old name still find the vendor)
--   merged_vendor_id            -- the deleted row's id (no FK: the row is gone; reversal recreates it)
--   snapshot                       -- the full deleted mdata.vendors row (to_jsonb)
--   repoint_log                    -- every table/column/row id moved to the canonical id, so reversal is exact
-- Entity-scoped (operating_company_id); FORCED RLS. Additive.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS mdata.vendor_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  canonical_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  alias_name text NOT NULL,
  alias_normalized text NOT NULL,
  merged_vendor_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  repoint_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_at timestamptz NOT NULL DEFAULT now(),
  merged_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  auth_id text NULL,
  reversed_at timestamptz NULL,
  reversed_by_user_id uuid NULL REFERENCES identity.users(id),
  CONSTRAINT vendor_aliases_one_per_merged UNIQUE (merged_vendor_id)
);
CREATE INDEX IF NOT EXISTS vendor_aliases_canonical_idx ON mdata.vendor_aliases (canonical_vendor_id);
CREATE INDEX IF NOT EXISTS vendor_aliases_normalized_idx ON mdata.vendor_aliases (operating_company_id, alias_normalized);

ALTER TABLE mdata.vendor_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.vendor_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_aliases_company_isolation ON mdata.vendor_aliases;
CREATE POLICY vendor_aliases_company_isolation ON mdata.vendor_aliases
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON mdata.vendor_aliases TO ih35_app;

COMMENT ON TABLE mdata.vendor_aliases IS
  'ROUND 326: merged duplicate vendors -- name, snapshot of the deleted row and the exact repoint log, so a merge is reversible and an old name still resolves to the canonical vendor.';

COMMIT;
