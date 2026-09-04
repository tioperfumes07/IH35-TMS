BEGIN;

-- LOAD-COSTS-COMPLETE items (1) and (2), TIMING correction (owner order 2026-09-04, quoting
-- QBO/NetSuite customer-deposit practice researched before picking an account number, per §7):
-- "Do not CR Accounts Receivable 1100 when no invoice exists yet ... invoice exists -> DR 2200
-- Driver Settlements Payable / CR 1100 AR; no invoice yet -> DR 2200 / CR a customer-deposit
-- liability, and it reclassifies to AR when the invoice is minted."
--
-- catalogs.accounts has no ON CONFLICT target on (operating_company_id, account_number) (only
-- accounts_pkey and uq_accounts_company_id(operating_company_id, id) exist -- verified live), so
-- this is an existence-checked idempotent insert, matching the pattern already used for every
-- other account created this program (e.g. 2200 itself). USMCA-only, per the standing USMCA-only
-- focus directive -- no live customer-deposit-style liability account exists for USMCA today
-- (verified live: only "Undeposited Funds," an unrelated Asset account, and its QBO mirror).
-- Number 2250 is free among the existing 2xxx liability series (2000 A/P .. 2600 IFTA/Sales Tax
-- Payable) and slots naturally after Driver Net-Pay Clearing / Driver Settlements Payable.
--
-- FIX (CI security-audit-heavy caught this before merge): org.companies.id is
-- DEFAULT gen_random_uuid() (0013_org_companies.sql) -- the literal '5c854333-...' is prod's
-- OBSERVED value, not a deterministic one, so it does not exist in CI's freshly-seeded database
-- and a hardcoded INSERT referencing it violates accounts_operating_company_id_fkey on replay.
-- Resolved by company code instead (0015_company_scoping.sql's own established convention),
-- portable to both prod (where code='USMCA' resolves to 5c854333-...) and CI's fresh seed.
DO $$
DECLARE
  v_usmca uuid := (SELECT id FROM org.companies WHERE code = 'USMCA');
BEGIN
  IF v_usmca IS NULL THEN
    RAISE EXCEPTION 'org.companies has no USMCA row -- cannot create the Customer Deposits account';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '2250'
  ) THEN
    INSERT INTO catalogs.accounts (
      operating_company_id, account_number, account_name, account_type, account_subtype,
      is_postable, currency_code, is_locked
    ) VALUES (
      v_usmca, '2250', 'Customer Deposits (Broker Advances)', 'Liability', 'Other Current Liabilities',
      true, 'USD', false
    );
  END IF;
END $$;

-- broker_advances gains the columns item (1)'s real JE and the invoice-mint reclassification JE
-- need. Additive, all nullable, idempotent. bank_account_id is required going forward at the
-- service layer (real cash needs a real bank), not enforced here by NOT NULL so existing
-- pre-JE rows (already correctly posted with no JE at the time) are never invalidated.
ALTER TABLE accounting.broker_advances
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES banking.bank_accounts(id),
  ADD COLUMN IF NOT EXISTS receipt_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reclass_journal_entry_id uuid REFERENCES accounting.journal_entries(id);

COMMENT ON COLUMN accounting.broker_advances.bank_account_id IS
  'banking.bank_accounts row the broker''s instrument was deposited/received into (item 1). Bridges to its GL account via ledger_account_id, same pattern as customer-payments.routes.ts.';
COMMENT ON COLUMN accounting.broker_advances.receipt_journal_entry_id IS
  'The real, balanced JE (DR bank / CR 1100 AR if applied_to_invoice_id is set at receipt time, else CR 2250 Customer Deposits) item (1) posts through journal-entries.service. NULL only for advances received before this GL wiring landed.';
COMMENT ON COLUMN accounting.broker_advances.reclass_journal_entry_id IS
  'Set only when this advance was received before an invoice existed (originally credited 2250) and buildInvoiceFromLoad later claimed it at invoice mint: DR 2250 / CR 1100, moving the liability to the real receivable. NULL when the advance was applied to a live invoice at receipt time (no reclass needed) or has not yet been claimed.';

COMMIT;
