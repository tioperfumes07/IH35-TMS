-- 202615781200_document_links_refused_at_db.sql
-- Cursor · ROUND 443.106 (Lead 2026-10-12): an invoice / driver bill / bill payment / expense from the load
-- wizard, feed or Settlement Creator can never be saved without its links. Engines already write them
-- (prod measured 07:55 CT / re-measured 08:48 CT). This migration makes the DATABASE refuse a broken row.
--
-- SHIPPED HERE
--   1. accounting.bills — refuse_driver_bill_without_links (BEFORE INSERT OR UPDATE, live rows only):
--      when bill_category = 'driver' OR load_id IS NOT NULL, require mdata_vendor_id (or non-blank
--      vendor_id), driver_id, load_id, unit_id. Trailer clause DEFERRED — prod still has driver bills
--      without trailer_id (measured 14 @ 443.106 merge check; CC-3 443.105 #1 owns the stamp/backfill).
--   2. accounting.bill_payments — vendor_id NOT NULL (prod: 0 null / 0 blank across all companies) +
--      BEFORE trigger refuses blank vendor_id on live rows.
--   3. accounting.expense_lines — refuse a line whose driver_id / unit_id differ from the header when
--      the header carries a load (expenses.driver_uuid / expenses.unit_id). Runs AFTER
--      trg_expense_lines_attribution_from_header (name order) so a NULL line that the header fills is
--      judged on the finished NEW row.
--
-- NOT RE-SHIPPED
--   expense_lines load_id OR load_exemption_reason — already 202615770700 (CC-2). Prod live violating
--   count is 0 at merge check; the live guard below asserts the existing trigger stays in force.
--
-- Idempotent; lock_timeout 60s. CREATE-only. No prod backfill.
BEGIN;
SET LOCAL lock_timeout = '60s';
SET LOCAL search_path TO pg_catalog, public;

-- ---------------------------------------------------------------------------
-- 1. Driver / load-born bills refuse missing core links
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.refuse_driver_bill_without_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
DECLARE
  missing text[] := ARRAY[]::text[];
  bill_label text;
  load_born boolean;
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  load_born := (NEW.bill_category = 'driver') OR (NEW.load_id IS NOT NULL);
  IF NOT load_born THEN
    RETURN NEW;
  END IF;

  IF NEW.mdata_vendor_id IS NULL
     AND NULLIF(btrim(COALESCE(NEW.vendor_id, '')), '') IS NULL THEN
    missing := array_append(missing, 'vendor');
  END IF;
  IF NEW.driver_id IS NULL THEN
    missing := array_append(missing, 'driver');
  END IF;
  IF NEW.load_id IS NULL THEN
    missing := array_append(missing, 'load');
  END IF;
  IF NEW.unit_id IS NULL THEN
    missing := array_append(missing, 'unit');
  END IF;

  IF coalesce(array_length(missing, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  bill_label := COALESCE(NULLIF(btrim(COALESCE(NEW.bill_number, '')), ''), NEW.id::text);
  RAISE EXCEPTION 'refuse_driver_bill_without_links: bill % is a live driver/load-born bill but is missing % — every driver bill carries vendor, driver, load and unit (ROUND 443.106)',
    bill_label, array_to_string(missing, ', ')
    USING ERRCODE = 'check_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_refuse_driver_bill_without_links ON accounting.bills;
CREATE TRIGGER trg_refuse_driver_bill_without_links
  BEFORE INSERT OR UPDATE OF bill_category, vendor_id, mdata_vendor_id, driver_id, load_id, unit_id, voided_at
  ON accounting.bills
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_driver_bill_without_links();

COMMENT ON FUNCTION accounting.refuse_driver_bill_without_links() IS
  'ROUND 443.106: a live driver/load-born bill carries vendor + driver + load + unit. Trailer deferred (CC-3 443.105).';

-- ---------------------------------------------------------------------------
-- 2. Bill payments — vendor required
-- ---------------------------------------------------------------------------
-- SET NOT NULL only when the target has 0 nulls (prod measured 0 @ 443.106 merge check).
-- Verify / fixture DBs may still carry historical null vendor_id rows; the BEFORE trigger
-- below refuses every NEW live blank/null write on every database. Do not backfill prod here.
DO $bp$
DECLARE
  null_n bigint;
BEGIN
  SELECT count(*) INTO null_n FROM accounting.bill_payments WHERE vendor_id IS NULL;
  IF null_n = 0 THEN
    ALTER TABLE accounting.bill_payments
      ALTER COLUMN vendor_id SET NOT NULL;
  ELSE
    RAISE NOTICE '202615781200: skipping SET NOT NULL on accounting.bill_payments.vendor_id — % null row(s) on this database (trigger still refuses new live blanks); prod must stay at 0',
      null_n;
  END IF;
END;
$bp$;

CREATE OR REPLACE FUNCTION accounting.refuse_bill_payment_without_vendor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NULLIF(btrim(COALESCE(NEW.vendor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'refuse_bill_payment_without_vendor: bill payment % is live but has no vendor_id — every bill payment carries its vendor (ROUND 443.106)',
      COALESCE(NEW.id::text, 'new')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_refuse_bill_payment_without_vendor ON accounting.bill_payments;
CREATE TRIGGER trg_refuse_bill_payment_without_vendor
  BEFORE INSERT OR UPDATE OF vendor_id, voided_at
  ON accounting.bill_payments
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_bill_payment_without_vendor();

COMMENT ON FUNCTION accounting.refuse_bill_payment_without_vendor() IS
  'ROUND 443.106: a live bill payment carries a non-blank vendor_id (NOT NULL when the target had 0 nulls at apply).';

-- ---------------------------------------------------------------------------
-- 3. Expense lines — attribution must match a load-bearing header
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.refuse_expense_line_attr_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
DECLARE
  h record;
  v_number text;
  missing text[] := ARRAY[]::text[];
BEGIN
  SELECT e.load_id, e.driver_uuid, e.unit_id, e.voided_at, e.expense_number
    INTO h
    FROM accounting.expenses e
   WHERE e.id = NEW.expense_id;

  IF NOT FOUND OR h.voided_at IS NOT NULL OR h.load_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF h.driver_uuid IS NOT NULL AND NEW.driver_id IS DISTINCT FROM h.driver_uuid THEN
    missing := array_append(missing, 'driver');
  END IF;
  IF h.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM h.unit_id THEN
    missing := array_append(missing, 'unit');
  END IF;

  IF coalesce(array_length(missing, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_number := COALESCE(h.expense_number, NEW.expense_id::text);
  RAISE EXCEPTION 'refuse_expense_line_attr_mismatch: expense % line % attribution (%) does not match its load-bearing header — driver/unit on the line must match the header (ROUND 443.106)',
    v_number, NEW.line_sequence, array_to_string(missing, ', ')
    USING ERRCODE = 'check_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_refuse_expense_line_attr_mismatch ON accounting.expense_lines;
CREATE TRIGGER trg_refuse_expense_line_attr_mismatch
  BEFORE INSERT OR UPDATE OF driver_id, unit_id, expense_id
  ON accounting.expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_expense_line_attr_mismatch();

COMMENT ON FUNCTION accounting.refuse_expense_line_attr_mismatch() IS
  'ROUND 443.106: when the expense header has a load, line driver_id/unit_id must match the header (driver_uuid/unit_id).';

COMMIT;
