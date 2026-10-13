-- 202615890700_team_driver_bill_accrued_at_delivery.sql
-- CC-2 · LEAD 443.128 C (locked design READ-FIRST §3: a cost is recognized once, on the day incurred; 443.116 (c) did this for
-- one-driver bills). A TEAM driver bill (one driver_finance.driver_bills row naming driver_id AND team_driver_id) is incurred
-- at delivery too: the delivery posts one A/P bill PER DRIVER for that driver's share (the load's team split), once.
--
--   driver_bills.accrued_team_bill_id — the co-driver's (team_driver_id's) delivery-posted A/P bill; accrued_bill_id stays the
--   driver_id's. Same-company composite FK; one driver bill per accrued A/P bill.
--
--   driver_settlement_gl_bills live-row key: old uq_driver_settlement_gl_bills_live_driver_bill (operating_company_id,
--   driver_bill_id) WHERE superseded_at IS NULL; new (operating_company_id, driver_bill_id, accounting_bill_id) WHERE
--   superseded_at IS NULL. Why: a team load's driver bill is settled by TWO settlements (one per driver), each on its own A/P
--   bill — the old key let the second driver's close fail. Still one live row per (driver bill, A/P bill): never posted twice.
-- Measured prod 2026-10-12: 0 team driver bills; every existing spine row has a distinct driver_bill_id, so the new key holds.
-- Idempotent; lock_timeout 60s.
BEGIN;
SET LOCAL lock_timeout = '60s';

ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS accrued_team_bill_id uuid REFERENCES accounting.bills(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_bills_accrued_team_bill_same_company_fkey') THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_accrued_team_bill_same_company_fkey
      FOREIGN KEY (operating_company_id, accrued_team_bill_id) REFERENCES accounting.bills (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_bills_team_accrual_needs_team_driver') THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_team_accrual_needs_team_driver CHECK (accrued_team_bill_id IS NULL OR team_driver_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_bills_accrued_team_bill_id ON driver_finance.driver_bills (accrued_team_bill_id) WHERE accrued_team_bill_id IS NOT NULL;

DROP INDEX IF EXISTS driver_finance.uq_driver_settlement_gl_bills_live_driver_bill;
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlement_gl_bills_live_driver_bill_ap_bill
  ON driver_finance.driver_settlement_gl_bills (operating_company_id, driver_bill_id, accounting_bill_id)
  WHERE superseded_at IS NULL;

COMMENT ON COLUMN driver_finance.driver_bills.accrued_team_bill_id IS
  'LEAD 443.128 C: the co-driver''s (team_driver_id) A/P bill for their share, posted at delivery; accrued_bill_id is driver_id''s.';

COMMIT;
