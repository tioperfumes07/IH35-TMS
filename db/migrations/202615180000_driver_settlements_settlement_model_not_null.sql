-- 202615180000_driver_settlements_settlement_model_not_null.sql
-- ROUND 313 CC-1 #3: a settlement row with NULL settlement_model blocked CC-3's load drawer. Measured
-- 2026-10-01: 0 NULL rows remain (64 USMCA settlements, all load_bookended); four writers still omitted the
-- column (settlements-mvp, settlements.routes presettle, weekly-close, feed seed-settlement-document) and now
-- stamp it. This makes the database refuse a NULL on write. NOT VALID + VALIDATE keeps the lock on
-- driver_finance.driver_settlements momentary (VALIDATE takes SHARE UPDATE EXCLUSIVE); lock_timeout so it
-- never queues behind traffic.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_settlements_settlement_model_not_null'
                 AND conrelid = 'driver_finance.driver_settlements'::regclass) THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_settlement_model_not_null CHECK (settlement_model IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.driver_settlements VALIDATE CONSTRAINT driver_settlements_settlement_model_not_null;

COMMIT;
