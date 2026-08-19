-- ACCT-F5541 — two real schema-parity gaps surfaced by widening verify-sql-column-existence.mjs's
-- UPDATE-target detection (it previously never checked a plain `UPDATE t SET col = … WHERE …` with no
-- FROM clause at all — a genuine blind spot, not a narrowing).
--
-- (1) banking.bank_accounts.visible / is_dip / tag — VERIFIED LIVE ON PROD (tiny-field-89581227,
--     information_schema.columns) that all three already exist: visible boolean NOT NULL DEFAULT
--     true, is_dip boolean NOT NULL DEFAULT false, tag text NULL. No migration in this repo adds
--     them — they predate the tracked migration history (0044_p3_t11_9_banking_rebuild.sql's own
--     comment calls `visible` a "pre-existing, unrelated mechanism" as of that migration, and
--     apps/backend/src/banking/banking.routes.ts's /api/v1/banking/accounts/visibility endpoint has
--     always written all three). This migration is a pure CATCH-UP: prod already has them (IF NOT
--     EXISTS makes this a no-op there); a fresh CI/dev database built from migrations alone did NOT
--     have them until now, so that endpoint would 42703 in any environment except prod.
--
-- (2) banking.bank_transactions.matched_advance_id — a REAL bug, not just a missing column:
--     cash-advances.routes.ts's mark-disbursed handler writes `UPDATE banking.bank_transactions SET
--     advance_id = …` — `advance_id` does not exist on this table ANYWHERE (verified live on prod:
--     zero columns matching '%advance%'), so this write has always thrown Postgres 42703 whenever a
--     caller supplied `bank_txn_id` in the mark-disbursed request body. The column this table actually
--     needs, following the table's own established `matched_<entity>_id uuid REFERENCES <table>(id)`
--     convention (0182_p7_w2_bank_transactions_review.sql: matched_invoice_id/matched_bill_id/
--     matched_payment_id/matched_bill_payment_id/matched_transfer_id/matched_journal_entry_id), is
--     matched_advance_id — genuinely new, added here, with the code fixed in the same PR to reference
--     the real column name.

BEGIN;

ALTER TABLE banking.bank_accounts
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_dip  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tag     text;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_advance_id uuid REFERENCES driver_finance.driver_advances(id);

COMMIT;
