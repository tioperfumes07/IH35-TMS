-- 202615430100_bills_display_id_assigned_at_insert.sql
-- CC-1 · LST-F412 — every TMS-native bill gets its human-readable id at INSERT, whichever writer inserts it.
--
-- ACCT-F186 gave bills a BILL-YYYY-NNNNN series, but only createBill (bills.service.ts) ever stamped it. Six other writers
-- insert accounting.bills directly and never did: banking bulk categorize (bulk-transactions.ts), bank-line splits
-- (bank-transaction-splits.service.ts), the maintenance poster, the two-section work-order service, the insurance policy
-- create, and the recurring worker's bill path. A bill from any of them could be cited only by raw UUID (03-display-ids).
-- Measured on prod 2026-10-06: TMS-native bills with display_id NULL in TRANSP 1, TRK 1 (both frozen; ACCT-F406 — no data
-- corrections, they stay as they are). USMCA has 0 bills since AUTH-400, so the FIRST USMCA bill from a bank line would
-- have been the next one.
--
-- One writer of the id for every path, so a future writer cannot forget it:
--   * TMS-native only (qbo_bill_id IS NULL). A QBO clone keeps its QBO identity; inventing one would break parallel books.
--   * A writer that supplies display_id (createBill with an operator-typed number) is left alone.
--   * Same series, lock and scope as nextBillDisplayId in display-id.ts: pg_advisory_xact_lock(hashtext(
--     'accounting.bill.display_id:' || operating_company_id)), MAX+1 within the entity and the bill_date's UTC year, five
--     digits minimum. The TS generator and this trigger serialize on the same lock, so they never hand out the same number.
--   * SECURITY DEFINER so MAX+1 sees every row of the entity regardless of the caller's RLS scope.
-- Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). No data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION accounting.assign_bill_display_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, accounting
AS $fn$
DECLARE
  v_prefix text;
  v_next   bigint;
BEGIN
  IF NEW.display_id IS NOT NULL OR NEW.qbo_bill_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_prefix := 'BILL-' || extract(year FROM COALESCE(NEW.bill_date, (now() AT TIME ZONE 'UTC')::date))::int::text || '-';
  PERFORM pg_advisory_xact_lock(hashtext('accounting.bill.display_id:' || NEW.operating_company_id::text));
  SELECT COALESCE(MAX(CASE WHEN b.display_id ~ ('^' || v_prefix || '[0-9]+$')
                           THEN substr(b.display_id, length(v_prefix) + 1)::bigint END), 0) + 1
    INTO v_next
    FROM accounting.bills b
   WHERE b.operating_company_id = NEW.operating_company_id
     AND b.display_id LIKE v_prefix || '%';
  NEW.display_id := v_prefix || CASE WHEN length(v_next::text) >= 5 THEN v_next::text ELSE lpad(v_next::text, 5, '0') END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_assign_bill_display_id ON accounting.bills;
CREATE TRIGGER trg_assign_bill_display_id
  BEFORE INSERT ON accounting.bills
  FOR EACH ROW EXECUTE FUNCTION accounting.assign_bill_display_id();

COMMIT;
