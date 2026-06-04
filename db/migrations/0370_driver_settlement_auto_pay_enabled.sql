-- P5-T5: per-driver settlement auto-pay toggle
ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS settlement_auto_pay_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mdata.drivers.settlement_auto_pay_enabled IS 'When true, payday cron queues ACH for finalized unpaid settlements.';
