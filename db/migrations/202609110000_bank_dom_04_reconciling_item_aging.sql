-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] BANK-DOM-04 — reconciling-item aging / classification columns.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. ***
-- Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill.
--
-- Adds optional operator override columns on banking.bank_transactions for aged uncleared items.
-- Application computes age buckets + default class; these columns persist classify/escalate overrides.
-- No GL math. No feature flag. FORCE RLS unchanged.

BEGIN;

DO $$
DECLARE
  v_txn regclass := to_regclass('banking.bank_transactions');
BEGIN
  IF v_txn IS NULL THEN
    RAISE NOTICE 'BANK-DOM-04: banking.bank_transactions absent — skip';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'banking' AND table_name = 'bank_transactions'
      AND column_name = 'reconciling_item_class'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD COLUMN reconciling_item_class text NULL
        CHECK (reconciling_item_class IS NULL OR reconciling_item_class IN ('timing', 'adjustment', 'investigate'));
    RAISE NOTICE 'BANK-DOM-04: added reconciling_item_class';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'banking' AND table_name = 'bank_transactions'
      AND column_name = 'reconciling_item_escalated_at'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD COLUMN reconciling_item_escalated_at timestamptz NULL;
    RAISE NOTICE 'BANK-DOM-04: added reconciling_item_escalated_at';
  END IF;

  CREATE INDEX IF NOT EXISTS idx_bank_txn_reconciling_escalated
    ON banking.bank_transactions (operating_company_id, reconciling_item_escalated_at)
    WHERE reconciling_item_escalated_at IS NOT NULL;
END
$$;

COMMIT;
