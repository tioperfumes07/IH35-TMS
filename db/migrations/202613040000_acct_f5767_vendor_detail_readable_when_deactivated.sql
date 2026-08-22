-- ACCT-F5767 — VENDORS-SELECT-HIDES-DEACTIVATED (LIVE FAIL). mdata.vendors' vendors_select RLS policy
-- (FORCE ROW LEVEL SECURITY) requires deactivated_at IS NULL for any non-bypass reader:
--
--   (identity.is_lucia_bypass() OR ((deactivated_at IS NULL) AND (operating_company_id IN (...))))
--
-- Live-confirmed: mdata.vendors 308f6434-0a51-4109-953e-c86ffb1f0999 (USMCA, deactivated_at set) is
-- cited by a real vendor-credit VC-2026-0001, but GET /api/v1/mdata/vendors/:id 404s because the RLS
-- policy hides the archived row entirely — breaking the void-not-delete requirement that archived
-- same-company rows stay READABLE (only "selectable for new work" should change, not visibility of an
-- already-linked historical record).
--
-- A PRIOR, deliberate migration (202612780000_vendor_historical_label_resolver.sql) explicitly declined
-- to weaken vendors_select directly, citing the real risk of leaking archived vendors into active
-- pickers/rosters that may rely on RLS alone. That reasoning still holds, so this migration does NOT
-- touch vendors_select — it follows the SAME established pattern (a narrow, same-company-scoped
-- SECURITY DEFINER resolver) for the detail-fetch-by-known-id use case specifically, mirroring
-- resolve_vendor_label_same_company's exact security shape: SECURITY DEFINER, fixed search_path,
-- same-company scoped, EXECUTE granted to ih35_app only.
--
-- Returns the raw mdata.vendors row (real column names, e.g. vendor_name not the API's "name" alias) —
-- the backend route (vendors.routes.ts GET :id) applies its own existing column aliasing/driver_name
-- join around this as a FALLBACK only when the primary RLS-scoped read returns nothing, so the common
-- (active vendor) path is completely unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.get_vendor_same_company(
  p_vendor_id uuid,
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
  WHERE v.id = p_vendor_id
    AND v.operating_company_id = p_operating_company_id
$$;

REVOKE ALL ON FUNCTION mdata.get_vendor_same_company(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.get_vendor_same_company(uuid, uuid) TO ih35_app;

COMMIT;
