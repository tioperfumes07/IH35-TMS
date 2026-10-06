-- 202615440100_lease_contract_lessee_vendor.sql
-- CC-1 · LST-F422 — the intercompany lessee's rent is a BILL to the lessor-as-vendor, every period.
--
-- The ASC 842 operating lease (owned by the lessor, e.g. TRK) posted the LESSEE's rent (TRANSP/USMCA) as a raw
-- journal line, Dr rent_expense / Cr ap_control, for period 1 only, at activation. Two root defects:
--   1. ROUND 393.1 (trg_ap_control_written_only_by_documents) refuses an ap_control line that is not a bill, bill
--      payment or vendor credit, so the first intercompany activation would throw. A/P is owed to a VENDOR, and a raw
--      line names none: the A/P subledger could never tie to GL.
--   2. Periods 2..N never posted the lessee leg (/operating/rental posts the lessor only), so the lessee's rent
--      expense and its payable stopped after month one.
--
-- The lessee's bill needs a vendor that lives in the LESSEE company and represents the lessor (owner, 2026-10-06:
-- TRK in USMCA is "Ih 35 Trucking-Vendor"). lessor_vendor_id cannot carry it: ROUND 316 gives that column a different
-- meaning (a lessee-owned contract billed by the monthly lease bill engine; loadLease refuses such a contract here).
-- Hence lessee_vendor_id:
--   * nullable FK to mdata.vendors (an external-customer lease has no lessee company and needs none);
--   * a trigger refuses a vendor that is not a vendor OF the lessee company, so a bill is never raised in one entity
--     against another entity's vendor row.
-- 0 lease contracts exist on prod (measured 2026-10-06), so nothing is backfilled. Idempotent. No data change.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE accounting.lease_contract
  ADD COLUMN IF NOT EXISTS lessee_vendor_id uuid REFERENCES mdata.vendors(id);

COMMENT ON COLUMN accounting.lease_contract.lessee_vendor_id IS
  'LST-F422: the lessor as a vendor IN THE LESSEE company (intercompany operating lease). The lessee''s rent for each period is a bill to this vendor. Must belong to lessee_operating_company_id (trg_lease_contract_lessee_vendor_in_lessee_company).';

CREATE OR REPLACE FUNCTION accounting.refuse_lease_lessee_vendor_outside_lessee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, accounting, mdata
AS $fn$
BEGIN
  IF NEW.lessee_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.lessee_operating_company_id IS NULL THEN
    RAISE EXCEPTION 'lease_lessee_vendor_without_lessee_company: lease % names a lessee vendor but no lessee company', NEW.id
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mdata.vendors v
     WHERE v.id = NEW.lessee_vendor_id
       AND v.operating_company_id = NEW.lessee_operating_company_id
  ) THEN
    RAISE EXCEPTION 'lease_lessee_vendor_not_in_lessee_company: vendor % is not a vendor of the lessee company % (lease %)',
      NEW.lessee_vendor_id, NEW.lessee_operating_company_id, NEW.id
      USING ERRCODE = 'P0001',
            HINT = 'Pick the lessor''s vendor record inside the lessee company (e.g. TRK in USMCA: its trucking vendor).';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_lease_contract_lessee_vendor_in_lessee_company ON accounting.lease_contract;
CREATE TRIGGER trg_lease_contract_lessee_vendor_in_lessee_company
  BEFORE INSERT OR UPDATE OF lessee_vendor_id, lessee_operating_company_id ON accounting.lease_contract
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_lease_lessee_vendor_outside_lessee();

COMMIT;
