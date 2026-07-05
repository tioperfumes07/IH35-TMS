-- 202607050840_fuel_transactions_source_row_hash_dedupe.sql
-- FUEL-1: give fuel.fuel_transactions an idempotency key so the fuel-card
-- transaction importer can ON CONFLICT DO NOTHING on re-runs (never double-insert).
--
-- source_row_hash is a deterministic sha256 of the card provider's own
-- reference (or a stable composite of date+card+unit+total+gallons) computed by
-- apps/backend/src/fuel/fuel-transaction-import.ts. NULLs are distinct in a
-- Postgres unique index, so manually-entered rows (hash NULL) never collide and
-- are unaffected. No new schema, no new grants (0300 already GRANTed
-- SELECT/INSERT/UPDATE on fuel.fuel_transactions to ih35_app).
BEGIN;

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS source_row_hash text NULL;

-- Idempotent unique index (NULL hashes are distinct → manual rows exempt).
CREATE UNIQUE INDEX IF NOT EXISTS fuel_tx_source_row_hash_uk
  ON fuel.fuel_transactions (operating_company_id, source_row_hash);

COMMIT;
