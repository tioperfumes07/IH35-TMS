-- LEAD 443.168 K — Engine Registry E-47 misdirected-payment alert (Faro contract: any payment WE receive on a Purchased
-- Account must be forwarded to Faro WITHIN 1 BUSINESS DAY; missing it is a breach that triggers acceleration).
-- Raised when a bank line is matched to a customer payment applied to a live purchased invoice. Posts nothing.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS accounting.factoring_misdirected_payment_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bank_transaction_id uuid NOT NULL REFERENCES banking.bank_transactions(id),
  ledger_entry_kind text NOT NULL CHECK (ledger_entry_kind IN ('payment', 'deposit', 'invoice')),
  ledger_entry_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id),
  purchase_id uuid NOT NULL REFERENCES accounting.factoring_purchases(id),
  purchase_line_id uuid NOT NULL REFERENCES accounting.factoring_purchase_lines(id),
  factor_vendor_id uuid REFERENCES mdata.vendors(id),
  customer_id uuid REFERENCES mdata.customers(id),
  received_on date NOT NULL,
  forward_by date NOT NULL CHECK (forward_by > received_on),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'forwarded', 'withdrawn')),
  raised_by_user_id uuid REFERENCES identity.users(id),
  resolved_by_user_id uuid REFERENCES identity.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factoring_misdirected_payment_alerts_resolved_has_actor CHECK (
    state = 'open' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

-- One live alert per (bank line, purchased invoice); a re-match after unmatch re-uses it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_misdirected_payment_alerts_line_invoice
  ON accounting.factoring_misdirected_payment_alerts (bank_transaction_id, invoice_id) WHERE state = 'open';
CREATE INDEX IF NOT EXISTS factoring_misdirected_payment_alerts_company_state_idx
  ON accounting.factoring_misdirected_payment_alerts (operating_company_id, state, forward_by);

CREATE OR REPLACE FUNCTION accounting.factoring_misdirected_payment_alert_same_entity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM banking.bank_transactions b WHERE b.id = NEW.bank_transaction_id AND b.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'factoring_misdirected_payment_alert: bank line % is not in company %', NEW.bank_transaction_id, NEW.operating_company_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounting.factoring_purchase_lines l JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
     WHERE l.id = NEW.purchase_line_id AND p.id = NEW.purchase_id AND l.invoice_id = NEW.invoice_id
       AND l.operating_company_id = NEW.operating_company_id AND p.operating_company_id = NEW.operating_company_id
  ) THEN
    RAISE EXCEPTION 'factoring_misdirected_payment_alert: line % / purchase % / invoice % not in company %', NEW.purchase_line_id, NEW.purchase_id, NEW.invoice_id, NEW.operating_company_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_factoring_misdirected_payment_alert_same_entity ON accounting.factoring_misdirected_payment_alerts;
CREATE TRIGGER trg_factoring_misdirected_payment_alert_same_entity BEFORE INSERT OR UPDATE ON accounting.factoring_misdirected_payment_alerts
  FOR EACH ROW EXECUTE FUNCTION accounting.factoring_misdirected_payment_alert_same_entity();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.factoring_misdirected_payment_alerts;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_misdirected_payment_alerts
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

DROP TRIGGER IF EXISTS tg_audit_row_factoring_misdirected_payment_alerts ON accounting.factoring_misdirected_payment_alerts;
CREATE TRIGGER tg_audit_row_factoring_misdirected_payment_alerts AFTER INSERT OR UPDATE OR DELETE ON accounting.factoring_misdirected_payment_alerts
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

ALTER TABLE accounting.factoring_misdirected_payment_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_misdirected_payment_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_misdirected_payment_alerts_company_isolation ON accounting.factoring_misdirected_payment_alerts;
CREATE POLICY factoring_misdirected_payment_alerts_company_isolation ON accounting.factoring_misdirected_payment_alerts
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.factoring_misdirected_payment_alerts TO ih35_app;

COMMIT;
