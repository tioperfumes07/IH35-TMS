-- 202615891200_driver_bill_trailer_clause.sql
-- Cursor · DEGH-05 / ROUND 443.129 + 443.131 (Lead 2026-10-12): finish the trailer clause that 443.106
-- deferred on accounting.refuse_driver_bill_without_links, and compare expense-line driver/unit to the
-- header even when the header field is NULL (null-null still matches; null vs set refuses).
--
-- Trailer clause (live driver/load-born bills only): trailer_id OR non_owned_trailer_id OR the load's
-- recorded trailer_source = 'none' (bobtail / power only). INSERT OR UPDATE only — existing rows are
-- not re-judged until touched (prod still has 4 USMCA driver bills on loads 13498/13520/13525/13562
-- without a trailer while the owner picks them).
--
-- Idempotent CREATE OR REPLACE. No prod backfill. No DELETE.
BEGIN;
SET LOCAL lock_timeout = '60s';
SET LOCAL search_path TO pg_catalog, public;

CREATE OR REPLACE FUNCTION accounting.refuse_driver_bill_without_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
DECLARE
  missing text[] := ARRAY[]::text[];
  bill_label text;
  load_born boolean;
  load_explicit_no_trailer boolean := false;
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

  -- DEGH-05: trailer_id OR non_owned_trailer_id OR load.trailer_source = 'none'
  IF NEW.load_id IS NOT NULL
     AND NEW.trailer_id IS NULL
     AND NEW.non_owned_trailer_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM mdata.loads l
       WHERE l.id = NEW.load_id
         AND l.operating_company_id = NEW.operating_company_id
         AND l.trailer_source = 'none'
    ) INTO load_explicit_no_trailer;
    IF NOT COALESCE(load_explicit_no_trailer, false) THEN
      missing := array_append(missing, 'trailer');
    END IF;
  END IF;

  IF coalesce(array_length(missing, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  bill_label := COALESCE(NULLIF(btrim(COALESCE(NEW.bill_number, '')), ''), NEW.id::text);
  RAISE EXCEPTION 'refuse_driver_bill_without_links: bill % is a live driver/load-born bill but is missing % — every driver bill carries vendor, driver, load, unit and trailer (or the load''s explicit no-trailer choice) (DEGH-05 / ROUND 443.131)',
    bill_label, array_to_string(missing, ', ')
    USING ERRCODE = 'check_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_refuse_driver_bill_without_links ON accounting.bills;
CREATE TRIGGER trg_refuse_driver_bill_without_links
  BEFORE INSERT OR UPDATE OF bill_category, vendor_id, mdata_vendor_id, driver_id, load_id, unit_id,
                             trailer_id, non_owned_trailer_id, voided_at
  ON accounting.bills
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_driver_bill_without_links();

COMMENT ON FUNCTION accounting.refuse_driver_bill_without_links() IS
  'DEGH-05 / 443.131: a live driver/load-born bill carries vendor + driver + load + unit + (trailer_id OR non_owned_trailer_id OR load.trailer_source=none). INSERT/UPDATE only.';

-- Expense lines: compare driver/unit even when the header field is NULL (IS DISTINCT FROM).
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

  IF NEW.driver_id IS DISTINCT FROM h.driver_uuid THEN
    missing := array_append(missing, 'driver');
  END IF;
  IF NEW.unit_id IS DISTINCT FROM h.unit_id THEN
    missing := array_append(missing, 'unit');
  END IF;

  IF coalesce(array_length(missing, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_number := COALESCE(h.expense_number, NEW.expense_id::text);
  RAISE EXCEPTION 'refuse_expense_line_attr_mismatch: expense % line % attribution (%) does not match its load-bearing header — driver/unit on the line must match the header even when the header is NULL (DEGH-05 / ROUND 443.131)',
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
  'DEGH-05 / 443.131: when the expense header has a load, line driver_id/unit_id must match the header (driver_uuid/unit_id) via IS DISTINCT FROM — null header vs set line refuses.';

COMMIT;
