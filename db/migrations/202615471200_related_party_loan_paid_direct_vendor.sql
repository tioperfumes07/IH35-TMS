-- 202615471200_related_party_loan_paid_direct_vendor.sql
-- Cursor · ROUND 443.22-2e — advances that never touch the company bank.
--
-- Owner (2026-10-10): When Laura / Alberto / Jorge pays Relay (or any vendor) from a personal
-- account there is no company bank line. The loan creator gets "Paid directly to a vendor":
-- it adds an advance to that person's facility and debits what was paid for (e.g. Relay Fuel
-- Wallet) in one document, with the same advance note as 2c. The owner names who paid
-- (lender); an intermediary (Alberto) may be recorded on the advance.
--
-- Additive, idempotent, CREATE-only. No DROP of data. No existing row rewritten.

BEGIN;
SET LOCAL lock_timeout = '15s';

-- Debit side of a paid-direct advance (what was paid for — Relay Fuel Wallet, prepaid, etc.).
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS funding_account_id uuid;
ALTER TABLE accounting.related_party_loan_entries
  ADD COLUMN IF NOT EXISTS intermediary_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'related_party_loan_entries_funding_account_id_fkey'
      AND conrelid = 'accounting.related_party_loan_entries'::regclass
  ) THEN
    ALTER TABLE accounting.related_party_loan_entries
      ADD CONSTRAINT related_party_loan_entries_funding_account_id_fkey
      FOREIGN KEY (funding_account_id) REFERENCES catalogs.accounts(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rpl_entries_funding_account_id
  ON accounting.related_party_loan_entries (funding_account_id)
  WHERE funding_account_id IS NOT NULL;

COMMENT ON COLUMN accounting.related_party_loan_entries.funding_account_id IS
  'ROUND 443.22-2e: CoA account debited for a paid-direct-to-vendor advance (e.g. Relay Fuel Wallet). Null for bank-line fundings.';
COMMENT ON COLUMN accounting.related_party_loan_entries.intermediary_name IS
  'ROUND 443.22-2e: optional intermediary who paid from a personal account (e.g. Alberto); lender remains counterparty_name.';

-- Widen target_type for paid-direct advances (existing rows keep their values).
ALTER TABLE accounting.related_party_loan_entries
  DROP CONSTRAINT IF EXISTS related_party_loan_entries_target_type_check;
ALTER TABLE accounting.related_party_loan_entries
  ADD CONSTRAINT related_party_loan_entries_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'bill'::text, 'settlement'::text, 'cash_advance'::text, 'expense'::text,
    'loan_out'::text, 'repayment'::text, 'intercompany'::text,
    'bank_funding'::text, 'bank_repayment'::text,
    'paid_direct_vendor'::text
  ]));

-- Self-check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting'
      AND table_name = 'related_party_loan_entries'
      AND column_name = 'funding_account_id'
  ) THEN
    RAISE EXCEPTION '202615471200: funding_account_id missing on related_party_loan_entries';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'related_party_loan_entries_target_type_check'
      AND conrelid = 'accounting.related_party_loan_entries'::regclass
      AND pg_get_constraintdef(oid) LIKE '%paid_direct_vendor%'
  ) THEN
    RAISE EXCEPTION '202615471200: target_type CHECK missing paid_direct_vendor';
  END IF;
END $$;

COMMIT;
