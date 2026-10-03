-- 202615370700_bills_bill_category.sql
-- U10 (owner UI register 2026-10-03, CC-2) — "every bills sub-tab renders only its own type". A bill stored no type:
-- the create form wrote "bill_type:<x>" into the free-text memo, and the Bills list guessed the type by matching memo /
-- vendor words (/maint|shop/, /fuel|diesel|loves/, /driver|settlement/), so each sub-tab showed the wrong bills and missed
-- the right ones. Measured on USMCA: 93 bills, none carries the memo marker; 90 are settlement bills owed to a driver's
-- own payable vendor, 3 are vendor bills.
--
-- bill_category is the stored type. A writer that knows it (the bill form opened from Maintenance / Repair / Fuel)
-- passes it; otherwise the BEFORE INSERT trigger derives it from FACTS only:
--   driver      — the bill's vendor is a driver's payable vendor (mdata.vendors.driver_id) — what the bill is owed to,
--                 not bills.driver_id, which on a vendor bill is attribution (whose truck)
--   maintenance — the bill is linked to a work order
--   vendor      — everything else
-- Backfill uses the same function, never the memo words. Frozen companies (TRANSPORTATION, TRUCKING) are not written.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS bill_category text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bills_bill_category') THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT chk_bills_bill_category
      CHECK (bill_category IS NULL OR bill_category IN ('vendor', 'maintenance', 'repair', 'fuel', 'driver')) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION accounting.bill_category_from_facts(p_vendor_id uuid, p_work_order_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.id = p_vendor_id AND v.driver_id IS NOT NULL) THEN 'driver'
    WHEN p_work_order_id IS NOT NULL THEN 'maintenance'
    ELSE 'vendor'
  END
$fn$;

CREATE OR REPLACE FUNCTION accounting.bills_set_category() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF NEW.bill_category IS NULL THEN
    NEW.bill_category := accounting.bill_category_from_facts(NEW.mdata_vendor_id, NEW.linked_work_order_uuid);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_bills_set_category ON accounting.bills;
CREATE TRIGGER trg_bills_set_category
  BEFORE INSERT ON accounting.bills
  FOR EACH ROW EXECUTE FUNCTION accounting.bills_set_category();

UPDATE accounting.bills b
   SET bill_category = accounting.bill_category_from_facts(b.mdata_vendor_id, b.linked_work_order_uuid)
 WHERE b.bill_category IS NULL
   AND b.operating_company_id NOT IN (SELECT id FROM org.companies WHERE code IN ('TRANSP', 'TRK'));

CREATE INDEX IF NOT EXISTS idx_bills_company_category ON accounting.bills (operating_company_id, bill_category);

COMMIT;
