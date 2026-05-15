-- P7-PLAID-CREDIT-CARD-SUPPORT — classify connected accounts for reconciliation routing.

BEGIN;

ALTER TABLE banking.bank_accounts
  ADD COLUMN IF NOT EXISTS account_class text NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_account_class_chk'
  ) THEN
    ALTER TABLE banking.bank_accounts
      ADD CONSTRAINT bank_accounts_account_class_chk
      CHECK (account_class IN ('depository', 'credit', 'investment', 'other'));
  END IF;
END $$;

UPDATE banking.bank_accounts
SET account_class = CASE
  WHEN lower(coalesce(account_type, '')) LIKE '%credit%' THEN 'credit'
  WHEN lower(coalesce(account_type, '')) IN ('checking', 'savings') THEN 'depository'
  ELSE account_class
END
WHERE account_class = 'other';

COMMIT;
