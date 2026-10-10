-- 202610100100_invoices_display_id_check_add_invoice_dash_load.sql
-- ROUND 443.8 (CC-1, 2026-10-10). Owner ruling: every from-load invoice is numbered
-- "<invoice number>-<load number>" (e.g. 3-13508, 59-13577, 119-13600).
--
-- ADDITIVE ONLY: existing four alternatives (INV-YYYY-NNNNN, L-YYYYMMDD-NNNN,
-- LUSMCAFREIGHT-YYYYMMDD-NNNN, plain digits) are KEPT; the fifth alternative
-- ^[0-9]{1,6}-[0-9]{1,12}$ is added. No existing row is affected (USMCA invoices = 0
-- today; all other shapes remain accepted). Idempotent DROP+ADD pattern.

BEGIN;

ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_display_id_check;

ALTER TABLE accounting.invoices
  ADD CONSTRAINT invoices_display_id_check
  CHECK (
    display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'
    OR display_id ~ '^L-[0-9]{8}-[0-9]{4}$'
    OR display_id ~ '^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$'
    OR display_id ~ '^[0-9]{1,12}$'
    OR display_id ~ '^[0-9]{1,6}-[0-9]{1,12}$'
  );

COMMENT ON CONSTRAINT invoices_display_id_check ON accounting.invoices IS
  'Widened 2026-10-10 (ROUND 443.8) to also accept <invoice-number>-<load-number> format (e.g. 3-13508). Prior alternatives unchanged: INV-YYYY-NNNNN (manual/legacy), L-YYYYMMDD-NNNN and LUSMCAFREIGHT-YYYYMMDD-NNNN (dead, kept per owner), plain digits (load_number shape).';

COMMIT;
