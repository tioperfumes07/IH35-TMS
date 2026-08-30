-- FACT-ASSIGN-05 CORRECTION (2026-08-30) -- factoring.customer_factor_assignment.operating_company_id
-- is nullable, and its only writer (assignCustomerToFactor, factor.service.ts) never set it --
-- every row this function has ever written left it NULL. This is the exact hazard this repo's own
-- batch.service.ts documents at LV-TXN-016: the table's own factoring_customer_factor_assignment_
-- opco_scope RLS policy gates WITH CHECK on this column; a second, newer tenant_id-keyed policy
-- happened to also cover writes (tenant_id was always set correctly), so this never surfaced as a
-- write failure -- but every row was left unscoped by the column meant to scope it, a real hazard
-- for any future reader/writer that filters on operating_company_id instead of tenant_id.
--
-- FIX: backfill operating_company_id = tenant_id on every existing row (same value for this table
-- -- tenant_id REFERENCES org.companies(id), i.e. it already IS the operating company), then add a
-- NOT NULL constraint so this cannot recur silently. The application-level fix (assignCustomerToFactor
-- now sets operating_company_id on every future INSERT) ships in the same PR as this migration.

BEGIN;

DO $$
BEGIN
  IF to_regclass('factoring.customer_factor_assignment') IS NULL THEN
    RAISE NOTICE 'FACT-ASSIGN-05 correction: factoring.customer_factor_assignment absent -- skipping';
    RETURN;
  END IF;

  UPDATE factoring.customer_factor_assignment
  SET operating_company_id = tenant_id
  WHERE operating_company_id IS NULL;

  -- Fail loud rather than silently add a NOT NULL that could still be violated by some row this
  -- migration's own UPDATE somehow missed (e.g. a tenant_id also NULL, which should never happen --
  -- tenant_id is itself NOT NULL on this table -- but confirm rather than assume).
  IF EXISTS (SELECT 1 FROM factoring.customer_factor_assignment WHERE operating_company_id IS NULL) THEN
    RAISE EXCEPTION 'FACT-ASSIGN-05 correction: operating_company_id still NULL on at least one row after backfill -- refusing to add NOT NULL';
  END IF;

  ALTER TABLE factoring.customer_factor_assignment
    ALTER COLUMN operating_company_id SET NOT NULL;
END
$$;

COMMIT;
