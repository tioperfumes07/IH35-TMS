-- ACCT-F73-PASS3 — finish the 2 bills ACCT-F73 deliberately left NULL.
--
-- WHY NOW: vendors_pull first succeeded 2026-08-02 (PR #3993). QBO vendor 2244
-- ("Jose Manuel Mejia Olmos") now exists in mdata.vendors (f45f37e3-…, qbo_vendor_id='2244').
-- At ACCT-F73 apply time the mirror row did not exist, so pass 1 could not resolve:
--   9a548b5d-b1da-4182-8d79-15fd7635b83f  $1,065.38  partial
--   bb42addb-65bc-49ca-b20a-7b65f872086a  $698.84    paid
--
-- PASS 3 — re-run the QBO-id match for any bill still NULL. Idempotent, entity-scoped,
-- no GL, no balances, no posting.

DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NULL OR to_regclass('mdata.vendors') IS NULL THEN
    RAISE NOTICE 'bills/vendors absent — skipping ACCT-F73 pass 3';
    RETURN;
  END IF;

  UPDATE accounting.bills b
     SET mdata_vendor_id = v.id,
         updated_at = now()
    FROM mdata.vendors v
   WHERE v.qbo_vendor_id = b.vendor_id
     AND v.operating_company_id = b.operating_company_id
     AND b.mdata_vendor_id IS NULL;
END $$;
