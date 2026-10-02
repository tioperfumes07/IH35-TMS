-- 202615170500_feed_gate_kinds_deposit_bill_payment.sql
-- FEED GATE (Lead, 2026-10-01): the QBO Make Deposit and Pay Bills feeds run the gate too. feed_kind CHECK gains
-- 'deposit' and 'bill_payment'. Additive constraint swap; no data change; idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE driver_finance.feed_intakes DROP CONSTRAINT IF EXISTS feed_intakes_feed_kind_check;
ALTER TABLE driver_finance.feed_intakes ADD CONSTRAINT feed_intakes_feed_kind_check
  CHECK (feed_kind IN ('settlement','load','expense','bill','invoice','factoring_statement','fuel_import','batch','deposit','bill_payment'));
COMMIT;
