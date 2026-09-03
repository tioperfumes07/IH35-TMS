-- USMCA customers: repair Latin-1-as-UTF-8 names; align status with deactivated_at.
-- Canonical live/dead switch for dispatch + autocomplete is deactivated_at IS NULL (not status).
-- Cursor lane HH 12–23. Idempotent. USMCA only. Never DELETE.

BEGIN;

UPDATE mdata.customers
SET
  customer_name = convert_from(convert_to(customer_name, 'LATIN1'), 'UTF8'),
  updated_at = now()
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND customer_name ~ 'Ã.|Â.'
  AND convert_from(convert_to(customer_name, 'LATIN1'), 'UTF8') IS NOT NULL
  AND convert_from(convert_to(customer_name, 'LATIN1'), 'UTF8') <> customer_name;

UPDATE mdata.customers
SET
  deactivated_at = NULL,
  updated_at = now()
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND id = '8a39ccca-bfb4-434b-aa26-59aa71dd0c33'
  AND deactivated_at IS NOT NULL;

UPDATE mdata.customers
SET
  status = 'inactive'::mdata.customer_status,
  updated_at = now()
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND status = 'active'::mdata.customer_status
  AND deactivated_at IS NOT NULL
  AND id <> '8a39ccca-bfb4-434b-aa26-59aa71dd0c33';

COMMIT;
