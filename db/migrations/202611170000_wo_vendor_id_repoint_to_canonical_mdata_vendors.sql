-- [FINANCIAL CLUSTER] MNT-VENDOR-CANONICAL — repoint maintenance.work_orders.vendor_id at the
-- canonical vendor table so a work order can name a vendor that actually exists.
-- Owner-directed 2026-08-02 (GUARD live finding, USMCA). Agent Neon-apply authorized (CPA ANSWERS H2,
-- owner reaffirmed in chat). POSTS NOTHING. Additive/structural only — no GL, no flag, no QBO push.
--
-- ROOT CAUSE, PROVEN ON PROD (br-fancy-credit-akjnd07a, positive control mdata.vendors=2,828):
--   maintenance.work_orders carries TWO vendor columns pointing at DIFFERENT tables --
--     vendor_id           FK -> mdata.qbo_vendors   (the RETIRE QBO mirror)
--     external_vendor_id  FK -> mdata.vendors       (canonical AP truth)
--   and work-orders.routes.ts validates the submitted vendor against mdata.qbo_vendors:
--       SELECT 1 FROM mdata.qbo_vendors WHERE id = $1 AND operating_company_id = $2
--   USMCA has 4 vendors in mdata.vendors (incl. "USMCA Audit Vendor 20260722") and **0** rows in
--   mdata.qbo_vendors -- the mirror is empty BY DESIGN because USMCA has no QuickBooks connection.
--   So the lookup returns nothing, the route answers bad_vendor, and creating a work order with a
--   vendor FAILS FOR EVERY VENDOR IN USMCA. It would fail identically for any entity without QBO.
--   That is what blocks the maintenance -> vendor -> A/P -> expense-GL chain from the UI.
--
--   This is precisely the case LINKAGE LAW §10 names: "Vendors (AP truth) -> mdata.vendors (the WO
--   picker must stop writing mdata.qbo_vendors)". The FK is the reason the route could not simply be
--   repointed in code -- the write would have violated fk_maintenance_work_orders_qbo_vendor.
--
-- WHY THIS IS SAFE TO DO NOW -- verified, not assumed: maintenance.work_orders holds 2 live rows and
--   BOTH vendor columns are entirely unused (vendor_id NOT NULL count = 0, external_vendor_id NOT NULL
--   count = 0). There is NOTHING to backfill and NO row that can orphan. The same change made later,
--   against populated data, would need a migration pass first.
--
-- NOT DROPPING THE COLUMN, NOT DROPPING external_vendor_id (Rule 07 additive-only): only the FK target
--   moves. vendor_qbo_id (text) stays for the QBO mirror id where an entity does have QuickBooks.
--
-- IDEMPOTENT: constraint work is IF EXISTS / NOT EXISTS guarded; apply-twice safe. No DELETE/TRUNCATE.

BEGIN;

DO $$
DECLARE
  v_orphans bigint;
BEGIN
  IF to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE EXCEPTION 'maintenance.work_orders missing — refusing to repoint blind';
  END IF;

  -- FAIL CLOSED: never point an FK at a table that cannot satisfy it. If any existing vendor_id does
  -- not resolve in mdata.vendors, abort rather than create an unenforceable constraint or lose a link.
  SELECT count(*) INTO v_orphans
  FROM maintenance.work_orders w
  WHERE w.vendor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.id = w.vendor_id);

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Refusing to repoint: % work_order(s) have a vendor_id that does not exist in mdata.vendors. '
      'Migrate those references first (they currently point at mdata.qbo_vendors).', v_orphans;
  END IF;

  ALTER TABLE maintenance.work_orders
    DROP CONSTRAINT IF EXISTS fk_maintenance_work_orders_qbo_vendor;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_maintenance_work_orders_vendor'
      AND conrelid = 'maintenance.work_orders'::regclass
  ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT fk_maintenance_work_orders_vendor
      FOREIGN KEY (vendor_id) REFERENCES mdata.vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN maintenance.work_orders.vendor_id IS
  'Canonical AP vendor (mdata.vendors). Repointed from the RETIRE mdata.qbo_vendors mirror 2026-08-02 '
  '(MNT-VENDOR-CANONICAL): the mirror is empty for any entity without a QuickBooks connection, so WO '
  'creation with a vendor failed outright in USMCA. QBO mirror ids live in vendor_qbo_id.';

COMMIT;
