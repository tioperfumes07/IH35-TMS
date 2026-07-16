-- Additive: allow CSV Relay fuel ingest_source (mirrors deposit table CHECK).
-- Root cause: code upserts with ingest_source='csv_import' but fuel table CHECK only allowed
-- daily_pull|webhook → every CSV fuel upsert failed constraint → Neon stayed at 0.
-- Never delete; widen CHECK only.

BEGIN;

ALTER TABLE integrations.relay_fuel_transactions
  DROP CONSTRAINT IF EXISTS relay_fuel_transactions_ingest_source_check;

ALTER TABLE integrations.relay_fuel_transactions
  ADD CONSTRAINT relay_fuel_transactions_ingest_source_check
  CHECK (ingest_source IN ('daily_pull', 'webhook', 'csv_import'));

COMMIT;
