-- 202615300600_factored_invoice_amount_lock.sql
-- ROUND 336 rule 7 (owner ruling: edit documents QuickBooks-style): "A FACTORED INVOICE'S AMOUNT IS NOT EDITABLE WHILE THE
-- PURCHASE IS OPEN. A factored invoice is COLLATERAL: Faro advanced cash against that exact amount, and 2150 ties to the Net
-- of open factored invoices. Refuse amount edits with a message naming the purchase and the Faro invoice number, and point
-- at the ROUND 335 reason-coded credit memo ... Non-amount fields stay editable: PO ref, bill-to, terms, memo. Normal rules
-- resume once the purchase closes."
--
-- Enforced in the DATABASE (a hidden button is not a permission): any change to an invoice's subtotal / tax / total, or any
-- insert, delete or amount change on its lines, is refused while the invoice sits on a live line of a posted, unvoided Faro
-- purchase AND still has an open balance (total − paid − credit memos applied > 0). Once the account is collected, written
-- down to zero, or its purchase voided, the purchase is closed for that invoice and normal edit rules resume.

BEGIN;

-- The purchase holding this invoice as open collateral, as text for the refusal message; NULL when the amount is editable.
CREATE OR REPLACE FUNCTION accounting.factored_invoice_amount_lock(p_invoice_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT format('purchase %s (Faro Inv %s)', p.display_id, COALESCE(l.faro_invoice_number, 'not recorded'))
    FROM accounting.factoring_purchase_lines l
    JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.status = 'posted' AND p.voided_at IS NULL
    JOIN accounting.invoices i ON i.id = l.invoice_id
   WHERE l.invoice_id = p_invoice_id
     AND l.voided_at IS NULL
     AND i.total_cents - COALESCE(i.amount_paid_cents, 0)
         - COALESCE((SELECT sum(a.applied_cents) FROM accounting.credit_memo_applications a
                      WHERE a.invoice_id = i.id AND a.voided_at IS NULL), 0) > 0
   ORDER BY p.purchase_date DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION accounting.fn_refuse_factored_invoice_amount_edit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_lock text;
BEGIN
  IF NEW.total_cents IS NOT DISTINCT FROM OLD.total_cents
     AND NEW.subtotal_cents IS NOT DISTINCT FROM OLD.subtotal_cents
     AND NEW.tax_cents IS NOT DISTINCT FROM OLD.tax_cents THEN
    RETURN NEW;
  END IF;
  v_lock := accounting.factored_invoice_amount_lock(OLD.id);
  IF v_lock IS NOT NULL THEN
    RAISE EXCEPTION 'factored_invoice_amount_locked: invoice % is collateral on % — its amount cannot change while the purchase is open; reduce it with a reason-coded credit memo (Faro register, short-pay write-down / ROUND 335). PO ref, bill-to, terms and memo stay editable.', OLD.display_id, v_lock
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refuse_factored_invoice_amount_edit ON accounting.invoices;
CREATE TRIGGER trg_refuse_factored_invoice_amount_edit BEFORE UPDATE OF total_cents, subtotal_cents, tax_cents ON accounting.invoices
  FOR EACH ROW EXECUTE FUNCTION accounting.fn_refuse_factored_invoice_amount_edit();

CREATE OR REPLACE FUNCTION accounting.fn_refuse_factored_invoice_line_edit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id); v_lock text; v_display text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.unit_amount_cents IS NOT DISTINCT FROM OLD.unit_amount_cents
     AND NEW.line_total_cents IS NOT DISTINCT FROM OLD.line_total_cents THEN
    RETURN NEW;
  END IF;
  v_lock := accounting.factored_invoice_amount_lock(v_invoice);
  IF v_lock IS NOT NULL THEN
    SELECT display_id INTO v_display FROM accounting.invoices WHERE id = v_invoice;
    RAISE EXCEPTION 'factored_invoice_amount_locked: invoice % is collateral on % — its lines cannot change amount while the purchase is open; reduce it with a reason-coded credit memo (ROUND 335).', v_display, v_lock
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_refuse_factored_invoice_line_edit ON accounting.invoice_lines;
CREATE TRIGGER trg_refuse_factored_invoice_line_edit BEFORE INSERT OR UPDATE OR DELETE ON accounting.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.fn_refuse_factored_invoice_line_edit();

GRANT EXECUTE ON FUNCTION accounting.factored_invoice_amount_lock(uuid) TO ih35_app;

COMMIT;
