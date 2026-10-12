-- 202615830700_driver_bill_due_date_and_delivery_accrual.sql
-- CC-2 · LEAD 443.116 #2 + (c), CORRECTION 16:50 UTC: the LOCKED design (claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md §3
-- "Three dates, three columns": incurred -> load margin / settlement / P&L; due_date -> cash flow / A/P aging; paid ->
-- reconciliation only; "A cost is recognized exactly once, on the day incurred"). Owner 2026-10-01 no-handoff.
--
-- (#2) driver_finance.driver_bills.due_date — the driver bill minted at booking is due on the load's projected delivery date:
--      the final active delivery stop's appointment / scheduled arrival (the later of the two, company time zone). It moves
--      when a stop's appointment / schedule changes (Edit Load, re-plan, late load) through trg_load_stops_driver_bill_due,
--      whatever code path writes the stop. When the final delivery stop records its actual departure, due_date is FIXED at
--      the delivery date (due_date_basis = 'delivered'). A past projected date on an undelivered load reads as today — at
--      read time (driver_finance.driver_bill_effective_due_date), never by a daily write.
-- (c)  driver_finance.driver_bills.accrued_bill_id — the per-load A/P bill posted AT DELIVERY (Dr driver pay / Cr A/P,
--      bill_date = due_date = delivery date) by apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.ts.
--      Settlement close applies advances / deductions / escrow / net pay to that same bill and never posts the pay again.
--      Same-company composite FK; one driver bill per accrued A/P bill.
-- Only open, unsettled, unaccrued, unvoided driver bills are (re)stamped — a settled or accrued bill keeps what it said.
-- No backfill: measured prod 2026-10-12, 0 open unsettled USMCA driver bills (all 145 settled). Idempotent; lock_timeout 60s.
BEGIN;
SET LOCAL lock_timeout = '60s';

ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS due_date_basis text;
ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS accrued_bill_id uuid REFERENCES accounting.bills(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_bills_due_date_basis_check') THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_due_date_basis_check CHECK (due_date_basis IS NULL OR due_date_basis IN ('projected', 'delivered'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_bills_accrued_bill_same_company_fkey') THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_accrued_bill_same_company_fkey
      FOREIGN KEY (operating_company_id, accrued_bill_id) REFERENCES accounting.bills (operating_company_id, id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_bills_accrued_bill_id ON driver_finance.driver_bills (accrued_bill_id) WHERE accrued_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_bills_open_due_date ON driver_finance.driver_bills (operating_company_id, due_date)
  WHERE voided_at IS NULL AND settled_in_settlement_id IS NULL;

-- The one rule: the load's driver-pay due date and its basis, from the FINAL ACTIVE delivery stop (highest sequence, not
-- cancelled, not soft-deleted — the same stop the revenue latch's evidence gate reads).
CREATE OR REPLACE FUNCTION driver_finance.load_driver_pay_due(p_load_id uuid)
RETURNS TABLE (due_date date, basis text)
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN s.actual_departure_at IS NOT NULL
              THEN (s.actual_departure_at AT TIME ZONE 'America/Chicago')::date
              ELSE (COALESCE(GREATEST(s.appointment_start_at, s.scheduled_arrival_at), s.appointment_end_at, s.scheduled_departure_at) AT TIME ZONE 'America/Chicago')::date
         END,
         CASE WHEN s.actual_departure_at IS NOT NULL THEN 'delivered' ELSE 'projected' END
    FROM mdata.load_stops s
   WHERE s.load_id = p_load_id
     AND s.stop_type::text = 'delivery'
     AND s.status::text <> 'cancelled'
     AND s.soft_deleted_at IS NULL
   ORDER BY s.sequence_number DESC
   LIMIT 1
$$;

-- Read-time roll-forward: an undelivered (projected) date already in the past is due today; a delivered date is fixed.
CREATE OR REPLACE FUNCTION driver_finance.driver_bill_effective_due_date(p_due_date date, p_basis text, p_today date)
RETURNS date
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN p_due_date IS NULL THEN NULL
              WHEN p_basis = 'delivered' THEN p_due_date
              ELSE GREATEST(p_due_date, p_today)
         END
$$;

CREATE OR REPLACE FUNCTION driver_finance.stamp_driver_bill_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_load uuid;
  v_due date;
  v_basis text;
BEGIN
  IF TG_TABLE_SCHEMA = 'driver_finance' THEN
    -- A driver bill is stamped at mint (an explicit due date from the writer is kept).
    IF NEW.accrued_bill_id IS NULL AND NEW.due_date IS NULL THEN
      SELECT d.due_date, d.basis INTO v_due, v_basis FROM driver_finance.load_driver_pay_due(NEW.load_id) d;
      NEW.due_date := v_due;
      NEW.due_date_basis := CASE WHEN v_due IS NULL THEN NULL ELSE v_basis END;
    END IF;
    RETURN NEW;
  END IF;

  v_load := CASE WHEN TG_OP = 'DELETE' THEN OLD.load_id ELSE NEW.load_id END;
  SELECT d.due_date, d.basis INTO v_due, v_basis FROM driver_finance.load_driver_pay_due(v_load) d;
  IF v_due IS NULL THEN
    RETURN NULL; -- no dated delivery stop left: the bill keeps its last known due date
  END IF;
  UPDATE driver_finance.driver_bills b
     SET due_date = v_due, due_date_basis = v_basis
   WHERE b.load_id = v_load
     AND b.voided_at IS NULL
     AND b.settled_in_settlement_id IS NULL
     AND b.accrued_bill_id IS NULL
     AND (b.due_date IS DISTINCT FROM v_due OR b.due_date_basis IS DISTINCT FROM v_basis);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_driver_bill_due_date_at_mint ON driver_finance.driver_bills;
CREATE TRIGGER trg_driver_bill_due_date_at_mint BEFORE INSERT ON driver_finance.driver_bills
  FOR EACH ROW EXECUTE FUNCTION driver_finance.stamp_driver_bill_due_date();

DROP TRIGGER IF EXISTS trg_load_stops_driver_bill_due ON mdata.load_stops;
CREATE TRIGGER trg_load_stops_driver_bill_due
  AFTER INSERT OR DELETE OR UPDATE OF appointment_start_at, appointment_end_at, scheduled_arrival_at, scheduled_departure_at,
    actual_departure_at, status, soft_deleted_at, sequence_number, stop_type
  ON mdata.load_stops
  FOR EACH ROW EXECUTE FUNCTION driver_finance.stamp_driver_bill_due_date();

-- (c) The settlement spine (driver_settlement_gl_bills) records the two bills a delivery-accrued load can carry at close:
--   bill_posted_at_delivery    the row's accounting bill is the delivery accrual — a settlement void reverses the payments and
--                              applications it made, never that bill (it predates the settlement and stays open on A/P);
--   pay_basis 'close_supplement' + supplements_driver_bill_id — pay above the accrual and reimbursements posted at close, one
--                              bill per load, reversed whole by a settlement void like any close-time bill.
-- Widened CHECKs (old: driver_bill_id NOT NULL unless salaried; pay_basis per_load_driver_bill | salaried) — why: one live row
-- per driver bill (uq_driver_settlement_gl_bills_live_driver_bill) keeps the accrued row; the supplement names its driver bill
-- in supplements_driver_bill_id instead.
ALTER TABLE driver_finance.driver_settlement_gl_bills ADD COLUMN IF NOT EXISTS bill_posted_at_delivery boolean NOT NULL DEFAULT false;
ALTER TABLE driver_finance.driver_settlement_gl_bills ADD COLUMN IF NOT EXISTS supplements_driver_bill_id uuid REFERENCES driver_finance.driver_bills(id);
ALTER TABLE driver_finance.driver_settlement_gl_bills DROP CONSTRAINT IF EXISTS driver_settlement_gl_bills_pay_basis_check;
ALTER TABLE driver_finance.driver_settlement_gl_bills
  ADD CONSTRAINT driver_settlement_gl_bills_pay_basis_check CHECK (pay_basis = ANY (ARRAY['per_load_driver_bill'::text, 'salaried'::text, 'close_supplement'::text]));
ALTER TABLE driver_finance.driver_settlement_gl_bills DROP CONSTRAINT IF EXISTS driver_settlement_gl_bills_driver_bill_or_salaried;
ALTER TABLE driver_finance.driver_settlement_gl_bills
  ADD CONSTRAINT driver_settlement_gl_bills_driver_bill_or_salaried CHECK (
    (driver_bill_id IS NOT NULL) OR (pay_basis = 'salaried'::text)
    OR (pay_basis = 'close_supplement'::text AND supplements_driver_bill_id IS NOT NULL));
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_settlement_gl_bills_supplement_shape') THEN
    ALTER TABLE driver_finance.driver_settlement_gl_bills
      ADD CONSTRAINT driver_settlement_gl_bills_supplement_shape CHECK (
        (pay_basis = 'close_supplement') = (supplements_driver_bill_id IS NOT NULL)
        AND NOT (pay_basis = 'close_supplement' AND (driver_bill_id IS NOT NULL OR bill_posted_at_delivery)));
  END IF;
END $$;

COMMENT ON COLUMN driver_finance.driver_bills.due_date IS
  'LEAD 443.116 #2: projected delivery date (final delivery stop appointment / schedule) while undelivered; fixed at the actual delivery date once delivered. Effective due: driver_finance.driver_bill_effective_due_date.';
COMMENT ON COLUMN driver_finance.driver_bills.due_date_basis IS 'LEAD 443.116 #2: projected | delivered.';
COMMENT ON COLUMN driver_finance.driver_bills.accrued_bill_id IS
  'LEAD 443.116 (c): the per-load A/P bill (Dr driver pay / Cr A/P) posted at delivery; settlement close applies to it and never posts the pay again.';

COMMIT;
