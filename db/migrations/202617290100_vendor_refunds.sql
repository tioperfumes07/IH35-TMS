-- VENDOR REFUNDS — the mirror of customer refunds (202617280100, owner 2026-11-27 22:40 CT "Build refund engine"; 22:54 CT "all and
-- total wiring … ar ap … fully total and complete").
--
-- QuickBooks "Deposit a vendor refund": a vendor owes the company money back on a vendor credit (goods returned, an overcharge, a
-- bill overpaid) and pays it by check / ACH / wire / card / cash into one of the company's bank or cash accounts.
--   * The vendor credit already posted Dr A/P / Cr the account it reduces (or the overpaid bill payment's bank), so the vendor's
--     credit sits as a DEBIT on A/P. The refund receives it: Dr the bank / Cr A/P. Posted by the ONE posting engine (source type
--     vendor_refund, sourceId = accounting.vendor_refunds.id).
--   * The refund consumes the vendor credit's unapplied amount (vendor_credits.amount_applied_cents grows by the refund), so it can
--     never be applied to a bill AND refunded — vendor_credits_check caps it.
--   * Never deleted. Voided (voided_at / void_reason): the posting reverses and the amount goes back to the vendor credit.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.vendor_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL CHECK (display_id ~ '^VR-[0-9]{4}-[0-9]{5}$'),
  vendor_id text,
  vendor_credit_id uuid NOT NULL REFERENCES accounting.vendor_credits(id),
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_refunds_display_id ON accounting.vendor_refunds (operating_company_id, display_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_refunds_idempotency ON accounting.vendor_refunds (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_refunds_vendor ON accounting.vendor_refunds (operating_company_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_refunds_vendor_credit ON accounting.vendor_refunds (vendor_credit_id);

ALTER TABLE accounting.vendor_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.vendor_refunds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_refunds_company_scope ON accounting.vendor_refunds;
CREATE POLICY vendor_refunds_company_scope ON accounting.vendor_refunds FOR ALL
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));
DROP POLICY IF EXISTS vendor_refunds_lucia_bypass ON accounting.vendor_refunds;
CREATE POLICY vendor_refunds_lucia_bypass ON accounting.vendor_refunds FOR SELECT
  USING (identity.is_lucia_bypass());

-- Append-only money document: no DELETE grant (void, never delete).
GRANT SELECT, INSERT, UPDATE ON accounting.vendor_refunds TO ih35_app;

DROP TRIGGER IF EXISTS tg_audit_row_vendor_refunds ON accounting.vendor_refunds;
CREATE TRIGGER tg_audit_row_vendor_refunds AFTER INSERT OR DELETE OR UPDATE ON accounting.vendor_refunds
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_period_lock_vendor_refunds ON accounting.vendor_refunds;
CREATE TRIGGER trg_period_lock_vendor_refunds BEFORE INSERT OR DELETE OR UPDATE ON accounting.vendor_refunds
  FOR EACH ROW EXECUTE FUNCTION accounting.tg_period_lock_doc('refund_date', 'amount_cents', 'bank_ledger_account_id', 'voided_at');

-- A vendor refund is an A/P DOCUMENT (it clears the debit a vendor credit left on A/P), so the ROUND 393.1 A/P write refusal
-- (202615380200) admits it alongside bill / bill_payment / vendor_credit. Same function body, one more document type; the trigger
-- itself is untouched.
CREATE OR REPLACE FUNCTION accounting.refuse_ap_control_write_without_document()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_depth integer := 0;
  v_line uuid := NEW.reversal_of_line_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
     WHERE r.operating_company_id = NEW.operating_company_id
       AND r.account_id = NEW.account_id
       AND r.role = 'ap_control'
       AND r.is_active
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.source_transaction_type IN ('bill', 'bill_payment', 'vendor_credit', 'vendor_refund') THEN
    RETURN NEW;
  END IF;
  IF NEW.source_transaction_type = 'driver_settlement' AND NEW.debit_or_credit = 'debit' THEN
    RETURN NEW;
  END IF;

  -- depth along the reversal chain: 1 = reverses an original line (removes it), 2 = reverses a reversal (re-adds), …
  WHILE v_line IS NOT NULL AND v_depth < 20 LOOP
    v_depth := v_depth + 1;
    SELECT p.reversal_of_line_id INTO v_line FROM accounting.journal_entry_postings p WHERE p.id = v_line;
  END LOOP;
  IF v_depth % 2 = 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'ap_control_write_refused: % % cents to A/P (account %) from source_transaction_type=% (reversal depth %) — A/P is written only by a bill, a bill payment, a vendor credit, a vendor refund or settlement deductions applied to load bills; any other line may only reverse an original (ROUND 393.1)',
    NEW.debit_or_credit, NEW.amount_cents, NEW.account_id, COALESCE(NEW.source_transaction_type, '(none)'), v_depth
    USING ERRCODE = 'P0001',
          HINT = 'Enter the bill (or bill payment / vendor credit / vendor refund). A correcting journal entry on A/P is the plug this rule exists to refuse.';
END;
$function$;

COMMENT ON FUNCTION accounting.refuse_ap_control_write_without_document() IS
  'ROUND 393.1 (+ vendor_refund, 202617290100): a posting on the company''s ap_control account must come from a bill / bill_payment / vendor_credit / vendor_refund (or settlement deductions applied to load bills, debit only), or be a reversal at odd depth (removing an amount). Refused at write time otherwise.';

COMMIT;
