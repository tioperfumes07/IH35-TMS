-- P7 Wave 2 v3 — banking.bank_accounts display_order / display_name (production-aligned hotfix).

BEGIN;

ALTER TABLE banking.bank_accounts
  ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE banking.bank_accounts
SET display_name = COALESCE(
  account_name,
  NULLIF(TRIM(BOTH FROM COALESCE(institution_name, '') || ' x' || COALESCE(account_mask, '')), '')
)
WHERE display_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_display_order
  ON banking.bank_accounts (operating_company_id, display_order, account_mask);

COMMIT;

-- Diagnostic (manual): SELECT operating_company_id, display_order, account_mask, display_name FROM banking.bank_accounts LIMIT 10;
