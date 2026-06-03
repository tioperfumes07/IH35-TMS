-- B14 / Block-O — archive seed-default customer/vendor classification tags (reversible)
-- Clears bogus bulk-applied tags: Late-pay, FMCSA: Not verified, Medium.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.customer_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES mdata.customers (id) ON DELETE CASCADE,
  tag_key text NOT NULL,
  tag_label text NOT NULL,
  applied_by_user_id uuid REFERENCES identity.users (id),
  applied_at timestamptz,
  archived_at timestamptz,
  archive_reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting.vendor_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  vendor_id uuid NOT NULL REFERENCES mdata.vendors (id) ON DELETE CASCADE,
  tag_key text NOT NULL,
  tag_label text NOT NULL,
  applied_by_user_id uuid REFERENCES identity.users (id),
  applied_at timestamptz,
  archived_at timestamptz,
  archive_reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_classifications_active
  ON accounting.customer_classifications (customer_id, operating_company_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_classifications_active
  ON accounting.vendor_classifications (vendor_id, operating_company_id)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_classifications_active_tag
  ON accounting.customer_classifications (customer_id, tag_key)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_classifications_active_tag
  ON accounting.vendor_classifications (vendor_id, tag_key)
  WHERE archived_at IS NULL;

ALTER TABLE accounting.customer_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.customer_classifications FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.vendor_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.vendor_classifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_classifications_tenant_scope ON accounting.customer_classifications;
CREATE POLICY customer_classifications_tenant_scope
  ON accounting.customer_classifications
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS vendor_classifications_tenant_scope ON accounting.vendor_classifications;
CREATE POLICY vendor_classifications_tenant_scope
  ON accounting.vendor_classifications
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.customer_classifications TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.vendor_classifications TO ih35_app;

-- Backfill legacy seed-default tags (no human attribution) before archival pass.
INSERT INTO accounting.customer_classifications (
  operating_company_id,
  customer_id,
  tag_key,
  tag_label,
  applied_by_user_id,
  applied_at,
  source
)
SELECT
  c.operating_company_id,
  c.id,
  'late_pay',
  'Late-pay',
  NULL,
  NULL,
  'seed_default_backfill_0325'
FROM mdata.customers c
WHERE c.deactivated_at IS NULL
  AND c.quality_payment_score IS NOT NULL
  AND c.quality_payment_score < 70
  AND NOT EXISTS (
    SELECT 1
    FROM mdata.customer_quality_events e
    WHERE e.customer_id = c.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM accounting.customer_classifications cc
    WHERE cc.customer_id = c.id
      AND cc.tag_key = 'late_pay'
  );

INSERT INTO accounting.customer_classifications (
  operating_company_id,
  customer_id,
  tag_key,
  tag_label,
  applied_by_user_id,
  applied_at,
  source
)
SELECT
  c.operating_company_id,
  c.id,
  'fmcsa_not_verified',
  'FMCSA: Not verified',
  NULL,
  NULL,
  'seed_default_backfill_0325'
FROM mdata.customers c
WHERE c.deactivated_at IS NULL
  AND c.fmcsa_verified_at IS NULL
  AND c.created_by_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM accounting.customer_classifications cc
    WHERE cc.customer_id = c.id
      AND cc.tag_key = 'fmcsa_not_verified'
  );

INSERT INTO accounting.vendor_classifications (
  operating_company_id,
  vendor_id,
  tag_key,
  tag_label,
  applied_by_user_id,
  applied_at,
  source
)
SELECT
  v.operating_company_id,
  v.id,
  'medium',
  'Medium',
  NULL,
  NULL,
  'seed_default_backfill_0325'
FROM mdata.vendors v
WHERE v.deactivated_at IS NULL
  AND (v.notes IS NULL OR v.notes NOT LIKE 'IH35_VENDOR_PROFILE_V1::%')
  AND v.created_by_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM accounting.vendor_classifications vc
    WHERE vc.vendor_id = v.id
      AND vc.tag_key = 'medium'
  );

-- Archive seed-applied rows (never human-attributed).
UPDATE accounting.customer_classifications
SET
  archived_at = COALESCE(archived_at, now()),
  archive_reason = COALESCE(archive_reason, '0325_clear_default_classifications_seed_purge')
WHERE applied_by_user_id IS NULL
  AND applied_at IS NULL
  AND archived_at IS NULL;

UPDATE accounting.vendor_classifications
SET
  archived_at = COALESCE(archived_at, now()),
  archive_reason = COALESCE(archive_reason, '0325_clear_default_classifications_seed_purge')
WHERE applied_by_user_id IS NULL
  AND applied_at IS NULL
  AND archived_at IS NULL;

-- Drop bogus seed payment scores that drove Late-pay UI without events.
UPDATE mdata.customers c
SET
  quality_payment_score = NULL,
  updated_at = now()
WHERE c.quality_payment_score IS NOT NULL
  AND c.quality_payment_score < 70
  AND NOT EXISTS (
    SELECT 1
    FROM mdata.customer_quality_events e
    WHERE e.customer_id = c.id
  );

COMMIT;

-- DOWN
-- BEGIN;
-- UPDATE mdata.customers c
-- SET quality_payment_score = cc.source_score
-- FROM (
--   SELECT customer_id, MAX(quality_payment_score) AS source_score
--   FROM accounting.customer_classifications
--   WHERE tag_key = 'late_pay'
--     AND archive_reason = '0325_clear_default_classifications_seed_purge'
--   GROUP BY customer_id
-- ) cc
-- WHERE c.id = cc.customer_id;
-- UPDATE accounting.customer_classifications
-- SET archived_at = NULL, archive_reason = NULL
-- WHERE archive_reason = '0325_clear_default_classifications_seed_purge';
-- UPDATE accounting.vendor_classifications
-- SET archived_at = NULL, archive_reason = NULL
-- WHERE archive_reason = '0325_clear_default_classifications_seed_purge';
-- DROP POLICY IF EXISTS vendor_classifications_tenant_scope ON accounting.vendor_classifications;
-- DROP POLICY IF EXISTS customer_classifications_tenant_scope ON accounting.customer_classifications;
-- DROP INDEX IF EXISTS uq_vendor_classifications_active_tag;
-- DROP INDEX IF EXISTS uq_customer_classifications_active_tag;
-- DROP INDEX IF EXISTS idx_vendor_classifications_active;
-- DROP INDEX IF EXISTS idx_customer_classifications_active;
-- DROP TABLE IF EXISTS accounting.vendor_classifications;
-- DROP TABLE IF EXISTS accounting.customer_classifications;
-- COMMIT;
