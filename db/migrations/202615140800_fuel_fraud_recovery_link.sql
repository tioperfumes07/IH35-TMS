-- 202615140800_fuel_fraud_recovery_link.sql
-- CC-2 (band HH 06-08), owner law 2026-10-01: "fuel fraud -> expense dispute chain -- build the money side".
-- Measured 2026-10-01: PATCH /fuel/fraud-alerts/:uuid/confirm-fraud only changed the alert's status; nothing
-- reached the purchase, the driver or the ledger, although fraud_alerts.status already allows 'recovered'.
-- The chain reuses the FUEL-03 overage engine end to end (pending_review -> approve with contract authority ->
-- postFuelOverageReceivable: Dr fuel_overage_receivable / Cr fuel expense -> settlement recovery). No new GL math.
--
--   fuel.fuel_card_overage_events.overage_rule gains 'confirmed_fraud' (a superset; existing rows still pass).
--   fuel.fraud_alerts.recovery_event_id -> the ONE live recovery event of the purchase. Many alerts (rules) on
--   one purchase share it; uq_fuel_card_overage_events_active_txn keeps a purchase recovered at most once.
-- ADDITIVE + IDEMPOTENT. No data written.

BEGIN;

ALTER TABLE fuel.fuel_card_overage_events DROP CONSTRAINT IF EXISTS fuel_card_overage_events_overage_rule_check;
ALTER TABLE fuel.fuel_card_overage_events
  ADD CONSTRAINT fuel_card_overage_events_overage_rule_check
  CHECK (overage_rule = ANY (ARRAY['non_fuel_purchase'::text, 'over_transaction_limit'::text, 'confirmed_fraud'::text]));

ALTER TABLE fuel.fraud_alerts
  ADD COLUMN IF NOT EXISTS recovery_event_id uuid NULL REFERENCES fuel.fuel_card_overage_events(id);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_recovery_event
  ON fuel.fraud_alerts (recovery_event_id) WHERE recovery_event_id IS NOT NULL;

COMMIT;
