-- ACCT-F5789 — CUSTOMERS-LIST-INACTIVE-FILTER-CONTRADICTS-RLS. apps/backend/src/mdata/customers.routes.ts's
-- LIST endpoint's status=inactive branch pushes `deactivated_at IS NOT NULL` into its WHERE clause, but
-- mdata.customers' customers_select RLS policy requires `deactivated_at IS NULL` for any non-bypass
-- reader -- these two conditions directly contradict when ANDed together. Worse than the vendors sibling
-- (ACCT-F5768): the endpoint ALSO unconditionally applies EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL
-- ("archived_at IS NULL") to every request regardless of status, and archived_at/deactivated_at are
-- stamped together by the same deactivate-customer write path (confirmed live) -- so status=inactive was
-- doubly impossible to satisfy, by RLS AND by this endpoint's own unconditional filter.
--
-- Live-confirmed before writing this migration: real deactivated USMCA customers exist (bypass-scoped
-- count), but the identical query as ih35_app with the correct company GUC set returns 0.
--
-- Same defect class as ACCT-F5767/5768/5787/5788 -- follows the identical, already-established security
-- pattern: SECURITY DEFINER, fixed search_path, scoped strictly to the caller's own
-- operating_company_id, EXECUTE granted to ih35_app only. Mirrors mdata.list_vendors_same_company
-- (202613050000, ACCT-F5768) exactly. Does NOT touch customers_select itself, for the same reason every
-- prior migration in this class did not: any consumer relying on RLS alone (not its own explicit filter)
-- to hide archived customers from active pickers/rosters must keep working unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.list_customers_same_company(
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
  WHERE c.operating_company_id = p_operating_company_id
$$;

REVOKE ALL ON FUNCTION mdata.list_customers_same_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.list_customers_same_company(uuid) TO ih35_app;

COMMIT;
