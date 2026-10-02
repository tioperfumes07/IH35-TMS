-- Lead ROUND 330.6 ruling 1 (CC-1) — a reversed settlement can be RE-POSTED against the same loads, but its bill
-- numbers are spent forever (QBO / NetSuite: a voided document keeps its number; the replacement gets a new one). What
-- was missing is the link: the new settlement names the reversed one (predecessor) and the reversed one names the new
-- one (successor), both visible on the settlement — so "why are there two bills for load 13633" is answered on screen.
--
-- Additive, nullable, idempotent. Self-referential FKs inside the same company (enforced by the writer, which only
-- links rows of one operating_company_id). One successor per predecessor (partial unique). driver_settlements keeps
-- its existing FORCE RLS and grants.
BEGIN;
ALTER TABLE driver_finance.driver_settlements
  ADD COLUMN IF NOT EXISTS predecessor_settlement_id uuid
    CONSTRAINT fk_driver_settlements_predecessor REFERENCES driver_finance.driver_settlements(id),
  ADD COLUMN IF NOT EXISTS successor_settlement_id uuid
    CONSTRAINT fk_driver_settlements_successor REFERENCES driver_finance.driver_settlements(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlements_predecessor
  ON driver_finance.driver_settlements (predecessor_settlement_id) WHERE predecessor_settlement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_driver_settlements_successor
  ON driver_finance.driver_settlements (successor_settlement_id) WHERE successor_settlement_id IS NOT NULL;

-- The settlement spine row (driver_settlement_gl_bills: driver bill -> A/P bill -> JEs -> payments) was unique per driver
-- bill for ALL time, so once a settlement was reversed its spine rows kept the driver bills and NO re-post could ever
-- write its own (fork: 23505 uq_driver_settlement_gl_bills_driver_bill). The reverser now stamps superseded_at on the
-- reversed run's rows (they stay — the audit trail of the reversed post) and only LIVE rows are unique per driver bill.
ALTER TABLE driver_finance.driver_settlement_gl_bills ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
UPDATE driver_finance.driver_settlement_gl_bills b
   SET superseded_at = r.reversed_at
  FROM driver_finance.driver_settlement_gl_runs r
 WHERE r.id = b.run_id AND r.status = 'reversed' AND b.superseded_at IS NULL;
ALTER TABLE driver_finance.driver_settlement_gl_bills DROP CONSTRAINT IF EXISTS uq_driver_settlement_gl_bills_driver_bill;
DROP INDEX IF EXISTS driver_finance.uq_driver_settlement_gl_bills_driver_bill;
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlement_gl_bills_live_driver_bill
  ON driver_finance.driver_settlement_gl_bills (operating_company_id, driver_bill_id) WHERE superseded_at IS NULL;
COMMIT;
