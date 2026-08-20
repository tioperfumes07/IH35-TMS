-- ACCT-F5611 — closes LV-INVOICES-LIST-SHOWS-30-OF-37. mdata.customers' own `customers_select` RLS
-- policy (FORCE ROW LEVEL SECURITY) excludes any `deactivated_at IS NOT NULL` row for a non-bypass
-- reader:
--
--   (identity.is_lucia_bypass() OR ((deactivated_at IS NULL) AND (operating_company_id IN (...))))
--
-- That is correct for ACTIVE pickers/rosters (a deactivated customer must never appear as a
-- selectable option on a new record) but wrong for a HISTORICAL reference: once a real invoice
-- already cites a customer, deactivating that customer later must not make the invoice vanish from
-- every list that INNER JOINs to resolve its display name -- the FK is still valid, the customer
-- still exists, only its "selectable for new work" status changed. Confirmed live (tiny-field-
-- 89581227): USMCA operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80 has 37
-- accounting.invoices rows; exactly 7 belong to a deactivated customer (37-7=30) -- matching the
-- reported "/accounting/invoices shows 1-30 of 30" gap precisely. accounting.invoices.routes.ts's
-- list AND count queries both use a plain (INNER) JOIN mdata.customers, so those 7 real, non-void-
-- filtered invoices silently disappear from both the row list and the total count for any real
-- authenticated session -- not a rendering bug, a data-arrival bug one layer down, the SAME class
-- already fixed once this session for vendors (202612780000).
--
-- FIX AT THE CANONICAL BOUNDARY, NOT PER-SCREEN: this adds ONE reusable, security-scoped resolver
-- any customer-bearing historical reader can call, mirroring
-- mdata.resolve_vendor_label_same_company (202612780000) exactly. It does NOT touch the
-- `customers_select` policy -- active-only pickers/rosters keep working exactly as before,
-- unchanged. It does NOT expose a general "read any customer" bypass -- the function enforces the
-- SAME operating_company_id scope the RLS policy itself enforces, just without the
-- `deactivated_at IS NULL` exclusion, and returns only the display label (customer_name), nothing
-- else about the row.
--
-- SECURITY DEFINER + neondb_owner (rolbypassrls=true, confirmed live) is the SAME trusted pattern
-- already used at scale by audit.tg_audit_row() (111+ triggers) and mdata.resolve_vendor_label_
-- same_company -- no new privilege model invented.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.resolve_customer_label_same_company(
  p_customer_id uuid,
  p_operating_company_id uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, mdata
STABLE
AS $$
  SELECT c.customer_name
  FROM mdata.customers c
  WHERE c.id = p_customer_id
    AND c.operating_company_id = p_operating_company_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION mdata.resolve_customer_label_same_company(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.resolve_customer_label_same_company(uuid, uuid) TO ih35_app;

COMMIT;
