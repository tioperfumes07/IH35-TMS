-- RULING 443.91 #4 (CC-3): accounting.invoices_display_id_check, exactly as PROD carries it. 202610100200 (adds the
-- ROUND 443.8 "<invoice>-<load>" form, e.g. 103-13625) was applied on prod AFTER 202613650001, but its number sorts
-- BEFORE it, so a fresh database (CI, every fork rebuilt from migrations) ends with 202613650001's narrower CHECK and the
-- from-load invoice writer (resolveInvoiceDisplayId, <invoice>-<load>) is refused there. Same definition as prod — no
-- form is added that prod does not already allow. Idempotent.
SET LOCAL lock_timeout = '60s';

ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_display_id_check;
ALTER TABLE accounting.invoices ADD CONSTRAINT invoices_display_id_check CHECK (
  display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'
  OR display_id ~ '^L-[0-9]{8}-[0-9]{4}$'
  OR display_id ~ '^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$'
  OR display_id ~ '^[0-9]{1,12}$'
  OR display_id ~ '^[0-9]{1,6}-[0-9]{1,12}$'
) NOT VALID;
ALTER TABLE accounting.invoices VALIDATE CONSTRAINT invoices_display_id_check;
