-- 202615170300_invoices_sent_requires_live_line.sql
-- ACCT-TIEOUT-01 root fix. Measured on prod 2026-10-01 (lucia): USMCA invoices 13616/13618/13620/13621/13622
-- ($20,800.00) were created in one direct batch 2026-09-28 11:26Z with ZERO accounting.invoice_lines rows and
-- flipped to status='sent' at 17:36Z (sent_at NULL) without the send path, so postInvoiceGlIfEnabled could never
-- post them (INVOICE_LINE_REVENUE_UNRESOLVED) and A/R GL sits exactly $20,800 under open invoices.
-- QuickBooks will not save a line-less invoice; the rule lives in the database so no direct writer can bypass it.
-- Additive, idempotent, no data change: existing rows are untouched until someone writes their status/total.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION accounting.fn_invoice_sent_requires_live_line()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('sent', 'partial', 'paid', 'overdue')
     AND NEW.voided_at IS NULL
     AND coalesce(NEW.total_cents, 0) <> 0
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.total_cents IS DISTINCT FROM NEW.total_cents)
     AND NOT EXISTS (SELECT 1 FROM accounting.invoice_lines il WHERE il.invoice_id = NEW.id AND il.soft_deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invoice_sent_requires_live_line: invoice % (%) cannot be % with total % cents and no live invoice line -- the send path writes the line first; the GL poster needs a revenue-bearing line to post A/R',
      NEW.display_id, NEW.id, NEW.status, NEW.total_cents USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invoice_sent_requires_live_line ON accounting.invoices;
CREATE TRIGGER trg_invoice_sent_requires_live_line
  BEFORE INSERT OR UPDATE OF status, total_cents, voided_at ON accounting.invoices
  FOR EACH ROW EXECUTE FUNCTION accounting.fn_invoice_sent_requires_live_line();

COMMENT ON FUNCTION accounting.fn_invoice_sent_requires_live_line() IS
  'ACCT-TIEOUT-01: an invoice with money on it cannot become sent/partial/paid/overdue without a live invoice_lines row (QBO parity; the GL poster needs a revenue-bearing line).';
COMMIT;
