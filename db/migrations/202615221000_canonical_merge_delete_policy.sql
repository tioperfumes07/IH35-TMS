-- 202615221000_canonical_merge_delete_policy.sql -- CC-3 queue 2a (claim #23993).
-- The canonical merge engine (apps/backend/src/mdata/canonical/canonical-entities.service.ts) deletes the merged
-- duplicate after repointing every reference and writing the alias (owner law 2026-10-02: no cancelled shells). Under the
-- app role ih35_app, mdata.customers / mdata.vendors have FORCED RLS with no DELETE policy, so that DELETE affected 0
-- rows: the engine now refuses (canonical_delete_blocked) instead of half-merging, and every in-app merge failed.
--
-- This adds exactly one narrow DELETE path for the app role, per table: a row may be deleted only when a LIVE
-- (unreversed) alias row in the SAME company already names it as the merged duplicate. The alias is written by the engine
-- in the same transaction, immediately before the delete, together with the row's full snapshot and the exact repoint
-- log — so the delete is always reversible (reverseCanonicalMerge). Nothing else in these tables becomes deletable.
-- Additive, idempotent.

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS customers_canonical_merge_delete ON mdata.customers;
CREATE POLICY customers_canonical_merge_delete ON mdata.customers
  FOR DELETE TO ih35_app
  USING (EXISTS (
    SELECT 1 FROM mdata.customer_aliases a
     WHERE a.merged_customer_id = customers.id
       AND a.operating_company_id = customers.operating_company_id
       AND a.reversed_at IS NULL));

DROP POLICY IF EXISTS vendors_canonical_merge_delete ON mdata.vendors;
CREATE POLICY vendors_canonical_merge_delete ON mdata.vendors
  FOR DELETE TO ih35_app
  USING (EXISTS (
    SELECT 1 FROM mdata.vendor_aliases a
     WHERE a.merged_vendor_id = vendors.id
       AND a.operating_company_id = vendors.operating_company_id
       AND a.reversed_at IS NULL));

COMMENT ON POLICY customers_canonical_merge_delete ON mdata.customers IS
  '202615221000: the only app-role DELETE — a duplicate the canonical engine merged (live alias names it, same company).';
COMMENT ON POLICY vendors_canonical_merge_delete ON mdata.vendors IS
  '202615221000: the only app-role DELETE — a duplicate the canonical engine merged (live alias names it, same company).';

COMMIT;
