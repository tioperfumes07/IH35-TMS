-- 202615180600_complaints_stop_driver_caused_chargeback.sql
-- CC-2 ROUND 313 item 1 (E-28 complaints against a driver). ONE complaints store: safety.complaints already carries
-- driver (respondent), load, unit, customer, severity, status, resolution, void (202615100000 / #23655). This adds what
-- the order names and the table lacked:
--   * complainant_type 'broker' and 'shipper' (customer / internal = employee were already there)
--   * stop_id — the stop the complaint is about (must belong to the complaint's load and company)
--   * driver_caused — the investigation's determination (NULL = not yet determined)
--   * the chargeback link: chargeback_deduction_id -> driver_finance.driver_settlement_deductions, amount, approver, time.
--     Owner C5:A: a chargeback reaches the driver ONLY when driver-caused AND approved — enforced by CHECK.
-- ADDITIVE + IDEMPOTENT. lock_timeout: fail fast rather than queue behind a long reader. No data written.

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE safety.complaints DROP CONSTRAINT IF EXISTS complaints_complainant_type_check;
ALTER TABLE safety.complaints ADD CONSTRAINT complaints_complainant_type_check
  CHECK (complainant_type = ANY (ARRAY['driver'::text, 'customer'::text, 'broker'::text, 'shipper'::text, 'employee'::text, 'external'::text, 'anonymous'::text]));

ALTER TABLE safety.complaints
  ADD COLUMN IF NOT EXISTS stop_id uuid NULL REFERENCES mdata.load_stops(id),
  ADD COLUMN IF NOT EXISTS driver_caused boolean NULL,
  ADD COLUMN IF NOT EXISTS chargeback_deduction_id uuid NULL REFERENCES driver_finance.driver_settlement_deductions(id),
  ADD COLUMN IF NOT EXISTS chargeback_cents bigint NULL,
  ADD COLUMN IF NOT EXISTS chargeback_approved_by uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS chargeback_approved_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'safety.complaints'::regclass AND conname = 'complaints_chargeback_only_driver_caused_approved') THEN
    ALTER TABLE safety.complaints ADD CONSTRAINT complaints_chargeback_only_driver_caused_approved CHECK (
      chargeback_deduction_id IS NULL
      OR (driver_caused IS TRUE AND chargeback_approved_by IS NOT NULL AND chargeback_approved_at IS NOT NULL
          AND chargeback_cents > 0 AND respondent_driver_id IS NOT NULL));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_complaints_stop ON safety.complaints (stop_id) WHERE stop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_chargeback ON safety.complaints (chargeback_deduction_id) WHERE chargeback_deduction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION safety.tg_complaints_stop_link() RETURNS trigger AS $$
BEGIN
  IF NEW.stop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
     WHERE s.id = NEW.stop_id AND l.operating_company_id = NEW.operating_company_id
       AND (NEW.load_id IS NULL OR s.load_id = NEW.load_id)) THEN
    RAISE EXCEPTION 'safety.complaints: stop % is not a stop of load % in company %', NEW.stop_id, NEW.load_id, NEW.operating_company_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_stop_link ON safety.complaints;
CREATE TRIGGER trg_complaints_stop_link BEFORE INSERT OR UPDATE OF stop_id, load_id ON safety.complaints
  FOR EACH ROW EXECUTE FUNCTION safety.tg_complaints_stop_link();

COMMIT;
