-- ACCT-COA-CANONICALIZATION (2/2) — deprecation note for accounting.coa_account.
--
-- accounting.coa_account is NOT the canonical chart of accounts. It is a QBO
-- expense-account mirror that feeds the PSE (Product/Service/Expense) enforcement
-- feature (accounting.ps_category / accounting.ps_item reference it, and
-- apps/backend/src/accounting/pse-mirror.service.ts populates/reads it). It is empty
-- in production only because the PSE mirror sync has not been triggered for the realm —
-- it is wired and live, so it is intentionally NOT dropped.
--
-- This migration is COMMENT-only: no DROP, no RENAME, no schema or data change.
-- Canonical posting COA = catalogs.accounts.
BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.coa_account') IS NOT NULL THEN
    COMMENT ON TABLE accounting.coa_account IS
      'PSE/QBO expense-account mirror for Product/Service/Expense enforcement. NOT the canonical chart of accounts. Canonical COA = catalogs.accounts. Do not use this table for GL posting account resolution.';
  END IF;
END $$;

COMMIT;
