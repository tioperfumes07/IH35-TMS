-- CLAIM 202615221400 — BANK-F91050 B-3 §19c resolve-the-difference Location column.
--
-- ORDERS-2026-10-01-BANKING-REGISTER-SET §B-3 MatchDrawer mini-grid:
--   date, payee, category, class, location, memo, amount — our bank_transaction_splits.
--
-- LIVE (Neon tiny-field-89581227 / br-fancy-credit-akjnd07a, 2026-10-02, bypass_rls=lucia):
--   banking.bank_transaction_splits has unit_id (class); location_id ABSENT.
--   mdata.locations exists.
--
-- Additive · idempotent · CREATE-only · no DROP · no money invented · no QBO write-back.
-- Cursor HH 12–23 · claimed #24125.

BEGIN;

ALTER TABLE banking.bank_transaction_splits
  ADD COLUMN IF NOT EXISTS location_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('mdata.locations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'bank_transaction_splits_location_id_fkey'
        AND conrelid = 'banking.bank_transaction_splits'::regclass
    ) THEN
      ALTER TABLE banking.bank_transaction_splits
        ADD CONSTRAINT bank_transaction_splits_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES mdata.locations(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN banking.bank_transaction_splits.location_id IS
  'Optional QBO Location on a resolve-the-difference / split line (mdata.locations). B-3 §19c.';

COMMIT;
