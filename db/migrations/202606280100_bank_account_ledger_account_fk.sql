-- [HOLD-FOR-JORGE — TIER 1] banking.bank_accounts.ledger_account_id → catalogs.accounts(id) FK
--
-- *** Migration on an existing table → trips hold-merge-gate (PROTECTED). Needs JORGE-APPROVED.
--     No posting, no GL flag — this only adds referential integrity for the bank↔cash-GL mapping. ***
--
-- WHY: the bank-account → cash GL account link is banking.bank_accounts.ledger_account_id (the column the
-- Cash-GL setup screen reads/writes; reused per GUARD fork-A — NOT a new cash_gl_account_id). Migration 0162
-- intended a FK: `ADD COLUMN IF NOT EXISTS ledger_account_id uuid REFERENCES catalogs.accounts(id)` — but the
-- column already existed (created in 0123), so IF NOT EXISTS skipped the ADD and the inline FK was NEVER
-- applied on prod (GUARD-verified: ledger_account_id has no FK on prod). This adds it idempotently, so a
-- bank account can never point at a non-existent COA account. (Cross-ENTITY validation — the chosen account's
-- operating_company_id must equal the bank account's — is enforced fail-loud at the route, not by this FK.)
--
-- Idempotent + fresh-DB safe: on a from-migrations DB 0162 DID apply the inline FK (column was new there), so
-- this checks for ANY existing FK on the ledger_account_id column and only adds when absent.

DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.conrelid = 'banking.bank_accounts'::regclass
        AND con.contype = 'f'
        AND a.attname = 'ledger_account_id'
    ) THEN
      ALTER TABLE banking.bank_accounts
        ADD CONSTRAINT bank_accounts_ledger_account_id_fkey
        FOREIGN KEY (ledger_account_id) REFERENCES catalogs.accounts(id);
    END IF;
  END IF;
END $$;

-- self-contained GRANTs (Standing Order #16) — banking.bank_accounts already granted; re-assert idempotently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app')
     AND to_regclass('banking.bank_accounts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON banking.bank_accounts TO ih35_app;
  END IF;
END $$;
