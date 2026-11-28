-- CUSTOMER REFUNDS — owner 2026-11-27 22:40 CT ("Build refund engine (Recommended)": one refund document per credit, posting
-- Dr the customer's credit / Cr bank, with a test proving the entry before it is used).
--
-- QuickBooks "Refund receipt / Refund a credit memo": the customer has credit left on its account (a credit memo's unapplied
-- amount — a return, an allowance, an overpayment) and the company pays that credit back by check, ACH, card or cash.
--
--   * A credit memo already posted Dr the account it names (or the payment that overpaid posted Dr bank) / Cr A/R, so the
--     customer's credit sits as a CREDIT on A/R. The refund pays it back: Dr A/R / Cr the bank (or cash register) the money
--     left from. Posted by the ONE posting engine (source type customer_refund, sourceId = accounting.customer_refunds.id).
--   * The refund consumes the credit memo's unapplied amount (credit_memos.amount_applied_cents grows by the refund, so
--     "left to apply" drops and the credit can never be applied AND refunded twice — credit_memos_check already caps it).
--   * Never deleted. A refund is reversed by voiding it (voided_at / void_reason), which reverses its journal entry and gives
--     the amount back to the credit memo.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.customer_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL CHECK (display_id ~ '^RF-[0-9]{4}-[0-9]{5}$'),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  credit_memo_id uuid NOT NULL REFERENCES accounting.credit_memos(id),
  refund_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  method text NOT NULL CHECK (method IN ('check', 'ach', 'wire', 'card', 'cash')),
  reference text,
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  bank_ledger_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  memo text,
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  idempotency_key text,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_refunds_display_id ON accounting.customer_refunds (operating_company_id, display_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_refunds_idempotency ON accounting.customer_refunds (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_refunds_customer ON accounting.customer_refunds (operating_company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_refunds_credit_memo ON accounting.customer_refunds (credit_memo_id);

ALTER TABLE accounting.customer_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.customer_refunds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_refunds_company_scope ON accounting.customer_refunds;
CREATE POLICY customer_refunds_company_scope ON accounting.customer_refunds FOR ALL
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));
DROP POLICY IF EXISTS customer_refunds_lucia_bypass ON accounting.customer_refunds;
CREATE POLICY customer_refunds_lucia_bypass ON accounting.customer_refunds FOR SELECT
  USING (identity.is_lucia_bypass());

-- Append-only money document: no DELETE grant (void, never delete).
GRANT SELECT, INSERT, UPDATE ON accounting.customer_refunds TO ih35_app;

DROP TRIGGER IF EXISTS tg_audit_row_customer_refunds ON accounting.customer_refunds;
CREATE TRIGGER tg_audit_row_customer_refunds AFTER INSERT OR DELETE OR UPDATE ON accounting.customer_refunds
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_period_lock_customer_refunds ON accounting.customer_refunds;
CREATE TRIGGER trg_period_lock_customer_refunds BEFORE INSERT OR DELETE OR UPDATE ON accounting.customer_refunds
  FOR EACH ROW EXECUTE FUNCTION accounting.tg_period_lock_doc('refund_date', 'amount_cents', 'bank_ledger_account_id', 'voided_at');

COMMIT;
