-- 202616250000_customer_vendor_names_normalized_at_write.sql
-- CC-3 · LEAD 443.347-B "name casing — extend write-time normalization to customers and vendors."
-- Drivers got triggers in 202616210300 (443.281-E). Customers and vendors stored ALL-CAPS names from
-- entry (e.g. "PEDRO HERNANDEZ TRUCKING", "JUAN GARCIA TRANSPORT"). Every screen proper-cased at READ
-- for persons; org names render as stored — so the fix is at WRITE (trigger + backfill).
--
-- ONE rule at WRITE for every writer (UI POST/PATCH): mdata.proper_person_name() (already exists from
-- 202616210300) applied via BEFORE INSERT/UPDATE triggers on:
--   mdata.customers  → customer_name
--   mdata.vendors    → vendor_name
-- Existing USMCA rows backfilled through those triggers (audited by row-change triggers).
-- Idempotent: properly-cased names map to themselves.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- mdata.proper_person_name() already exists from 202616210300; no need to redefine.

CREATE OR REPLACE FUNCTION mdata.tg_customers_proper_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.customer_name := mdata.proper_person_name(NEW.customer_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_proper_name ON mdata.customers;
CREATE TRIGGER trg_customers_proper_name
  BEFORE INSERT OR UPDATE OF customer_name ON mdata.customers
  FOR EACH ROW EXECUTE FUNCTION mdata.tg_customers_proper_name();

CREATE OR REPLACE FUNCTION mdata.tg_vendors_proper_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.vendor_name := mdata.proper_person_name(NEW.vendor_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_proper_name ON mdata.vendors;
CREATE TRIGGER trg_vendors_proper_name
  BEFORE INSERT OR UPDATE OF vendor_name ON mdata.vendors
  FOR EACH ROW EXECUTE FUNCTION mdata.tg_vendors_proper_name();

-- Backfill: USMCA customers whose stored name differs from what the trigger would produce.
UPDATE mdata.customers cu
   SET customer_name = customer_name
  FROM org.companies c
 WHERE c.id = cu.operating_company_id
   AND c.code = 'USMCA'
   AND cu.customer_name IS DISTINCT FROM mdata.proper_person_name(cu.customer_name);

-- Backfill: USMCA vendors whose stored name differs from what the trigger would produce.
UPDATE mdata.vendors v
   SET vendor_name = vendor_name
  FROM org.companies c
 WHERE c.id = v.operating_company_id
   AND c.code = 'USMCA'
   AND v.vendor_name IS DISTINCT FROM mdata.proper_person_name(v.vendor_name);

COMMIT;
