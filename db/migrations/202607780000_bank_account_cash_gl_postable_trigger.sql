-- [HOLD-FOR-JORGE — TIER 1 · §1.4 FINANCIAL CLUSTER] Banking cash-GL bridge must reject
-- non-postable catalogs.accounts (lane defect E follow-up / WO item 6).
--
-- *** DO NOT RUN ON PROD VIA db:migrate. Apply ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill. Companion to route-level is_postable checks (#3338). ***
--
-- Mirrors catalogs.assert_payment_method_gl_same_entity (202607380000): BEFORE INSERT/UPDATE
-- on banking.bank_accounts.ledger_account_id, require the pointed CoA row is_postable = true
-- (and same entity). Header/non-postable accounts must never be cash-GL bound.

BEGIN;

CREATE OR REPLACE FUNCTION banking.assert_cash_gl_account_postable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ledger_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM catalogs.accounts a
    WHERE a.id = NEW.ledger_account_id
      AND a.operating_company_id = NEW.operating_company_id
      AND a.is_postable = true
      AND a.deactivated_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'bank_account ledger_account_id % is missing, cross-entity, deactivated, or not is_postable for operating_company %',
      NEW.ledger_account_id, NEW.operating_company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_account_cash_gl_postable ON banking.bank_accounts;
CREATE TRIGGER trg_bank_account_cash_gl_postable
  BEFORE INSERT OR UPDATE OF ledger_account_id, operating_company_id
  ON banking.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION banking.assert_cash_gl_account_postable();

COMMIT;
