-- ACCT-F5768 — VENDORS-LIST-INACTIVE-FILTER-CONTRADICTS-RLS. apps/backend/src/mdata/vendors.routes.ts's
-- LIST endpoint's status=inactive branch pushes `deactivated_at IS NOT NULL` into its WHERE clause, but
-- mdata.vendors' vendors_select RLS policy requires `deactivated_at IS NULL` for any non-bypass reader —
-- these two conditions directly contradict when ANDed together, so a status=inactive request from a real
-- (non-bypass) user always returns 0 rows regardless of how many real deactivated vendors exist.
--
-- Live-confirmed before writing this migration: 11 real deactivated USMCA vendors exist (bypass-scoped
-- count), but the identical query as ih35_app with the correct company GUC set returns 0.
--
-- Same defect class as ACCT-F5767 (VENDORS-SELECT-HIDES-DEACTIVATED, migration 202613040000, PK-scoped
-- single-row lookup) — this is the LIST-view sibling, so it needs a SET-returning source instead. Follows
-- the identical, already-established security pattern: SECURITY DEFINER, fixed search_path, scoped
-- strictly to the caller's own operating_company_id, EXECUTE granted to ih35_app only. Does NOT touch
-- vendors_select itself, for the same reason 202612780000 and 202613040000 did not: any consumer relying
-- on RLS alone (not its own explicit filter) to hide archived vendors from active pickers/rosters must
-- keep working unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.list_vendors_same_company(
  p_operating_company_id uuid
)
RETURNS SETOF mdata.vendors
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, mdata
STABLE
AS $$
  SELECT v.*
  FROM mdata.vendors v
  WHERE v.operating_company_id = p_operating_company_id
$$;

REVOKE ALL ON FUNCTION mdata.list_vendors_same_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.list_vendors_same_company(uuid) TO ih35_app;

COMMIT;
