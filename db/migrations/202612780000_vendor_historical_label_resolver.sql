-- LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL — mdata.vendors' own `vendors_select` RLS
-- policy (FORCE ROW LEVEL SECURITY) hard-excludes every row with `deactivated_at IS NOT NULL` for
-- any non-bypass reader:
--
--   (identity.is_lucia_bypass() OR ((deactivated_at IS NULL) AND (operating_company_id IN (...))))
--
-- That is correct for ACTIVE pickers/rosters (a deactivated vendor must never appear as a
-- selectable option on a new record) but wrong for a HISTORICAL reference: once a real FK already
-- points at a vendor, deactivating that vendor later must not turn its label into "Vendor — not
-- visible" on every existing record that legitimately cites it — the FK is still valid, the vendor
-- still exists, only its "selectable for new work" status changed. Confirmed live: production part
-- `780c71a9-...` cites vendor `2cbaf657-...` ("P42-VENDOR-FK-20260811", `deactivated_at` set); the
-- Parts & Stock reader's plain LEFT JOIN to mdata.vendors silently drops the row via RLS, and
-- entityLabel correctly (per its own design) falls back to "Vendor — not visible" for a label that
-- never arrived — not a rendering bug, a data-arrival bug one layer down.
--
-- FIX AT THE CANONICAL BOUNDARY, NOT PER-SCREEN: rather than special-casing Inventory's query (which
-- would just be the next place this same RLS shape bites), this adds ONE reusable, security-scoped
-- resolver any vendor-bearing historical reader can call. It does NOT touch the `vendors_select`
-- policy — active-only pickers/rosters keep working exactly as before, unchanged. It does NOT expose
-- a general "read any vendor" bypass — the function enforces the SAME operating_company_id scope the
-- RLS policy itself enforces, just without the `deactivated_at IS NULL` exclusion, and returns only
-- the display label (vendor_name), nothing else about the row.
--
-- SECURITY DEFINER + neondb_owner (rolbypassrls=true, confirmed live) is the SAME trusted pattern
-- already used at scale by audit.tg_audit_row() (111+ triggers) — no new privilege model invented.
-- EXECUTE is granted to ih35_app only (the runtime app role); no other grantee.
--
-- REHEARSED on a disposable Neon branch (forked from prod, deleted after use): resolves a real
-- deactivated vendor's name for its own company, returns NULL for a vendor belonging to a DIFFERENT
-- company (cross-company denial confirmed), and returns NULL for a non-existent id.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.resolve_vendor_label_same_company(
  p_vendor_id uuid,
  p_operating_company_id uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, mdata
STABLE
AS $$
  SELECT v.vendor_name
  FROM mdata.vendors v
  WHERE v.id = p_vendor_id
    AND v.operating_company_id = p_operating_company_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION mdata.resolve_vendor_label_same_company(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.resolve_vendor_label_same_company(uuid, uuid) TO ih35_app;

COMMIT;
