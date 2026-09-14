-- INBOX-CC-1 backlog item (1), CC-2 -> CC-1, 2026-09-13 14:33 -- dropped in the day's chat-relay
-- flow, picked up per the 2026-09-14 ALL-SEATS bus-discipline directive requiring stale INBOX
-- items to actually be read and acted on. Blocks CC-2's fuel-ingestion expense-repoint/void
-- de-dupe step (ALWAYSTRACK ingestion spec §3.4: "the expense posts FROM that row and carries
-- source_fuel_transaction_id. One receipt -> one fuel row -> one posting.").
--
-- Additive, nullable, idempotent. No data touched, no GL math, no RLS change.

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS source_fuel_transaction_id uuid NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_source_fuel_transaction_id_fkey') THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_source_fuel_transaction_id_fkey
      FOREIGN KEY (source_fuel_transaction_id) REFERENCES fuel.fuel_transactions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_source_fuel_transaction_id
  ON accounting.expenses (source_fuel_transaction_id) WHERE source_fuel_transaction_id IS NOT NULL;
