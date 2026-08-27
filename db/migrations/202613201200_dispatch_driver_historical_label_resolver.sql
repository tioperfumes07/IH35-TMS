-- DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS
-- Historical same-company driver display label. mdata.drivers SELECT RLS hides
-- deactivated_at IS NOT NULL rows (correct for pickers). Dispatch list/detail LEFT JOIN
-- then renders "Driver — not visible". Mirror mdata.resolve_customer_label_same_company /
-- resolve_vendor_label_same_company: SECURITY DEFINER, label-only, same operating_company_id,
-- does NOT change drivers_select. Idempotent CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.resolve_driver_label_same_company(
  p_driver_id uuid,
  p_operating_company_id uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, mdata
STABLE
AS $$
  SELECT NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), '')
  FROM mdata.drivers d
  WHERE d.id = p_driver_id
    AND d.operating_company_id = p_operating_company_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION mdata.resolve_driver_label_same_company(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mdata.resolve_driver_label_same_company(uuid, uuid) TO ih35_app;

COMMIT;
