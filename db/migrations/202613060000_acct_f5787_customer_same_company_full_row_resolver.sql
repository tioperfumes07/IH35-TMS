-- ACCT-F5787 — CLS-DEACTIVATED-PLAIN-JOIN-CUSTOMERS-VENDORS (factoring/submission-queue.service.ts
-- instance). mdata.customers' customers_select RLS policy (FORCE ROW LEVEL SECURITY) requires
-- deactivated_at IS NULL for any non-bypass reader:
--
--   (identity.is_lucia_bypass() OR ((deactivated_at IS NULL) AND (operating_company_id IN (...))))
--
-- Live-confirmed on prod (as the real ih35_app runtime role, current_user asserted in the same query):
-- factoring/submission-queue.service.ts's plain double JOIN (accounting.invoices -> mdata.customers ->
-- mdata.vendors, the factoring-company vendor pointed to by the customer) silently drops a real,
-- currently-sendable USMCA invoice (status='sent', factoring_status='not_factored') from the operator's
-- "submit to Faro" queue the moment its customer or the factoring-company vendor record is
-- deactivated — a live, active-today money-flow defect (broken=0 rows, fixed=1 row for the exact same
-- WHERE clause).
--
-- Unlike the earlier customer-name-only fixes this session (ACCT-F5611/5784/5785/5786, which reused
-- mdata.resolve_customer_label_same_company), submission-queue.service.ts's query needs the FULL
-- customer row (specifically c.factoring_company_vendor_id, used both in the WHERE clause and to drive
-- the second JOIN to mdata.vendors) — a label-only resolver cannot supply that. This migration adds a
-- full-row resolver mirroring mdata.get_vendor_same_company (202613040000, ACCT-F5767) exactly: SAME
-- security shape (SECURITY DEFINER, fixed search_path, same-company scoped, EXECUTE to ih35_app only),
-- same-company scoped, RETURNS SETOF mdata.customers. Does NOT touch customers_select — the established
-- pattern this session has followed 6 times running is a narrow same-company fallback, never weakening
-- the RLS policy that protects active-only pickers/rosters.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.get_customer_same_company(
  p_customer_id uuid,
  p_operating_company_id uuid
)
RETURNS SETOF mdata.customers
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, mdata
STABLE
AS $$
  SELECT c.*
  FROM mdata.customers c
  WHERE c.id = p_customer_id
    AND c.operating_company_id = p_operating_company_id
$$;

REVOKE ALL ON FUNCTION mdata.get_customer_same_company(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.get_customer_same_company(uuid, uuid) TO ih35_app;

COMMIT;
