-- SCENTSX B3c — which invoice line bills which TIO Perfumes sales-order line, and how many units.
--
-- Owner 2026-11-26 20:16 CT "complete wiring to ledgers"; 21:37 CT "just create the engines and complete. Fully linked and
-- wired." Design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC (posting map: "Invoice for the shipment"). A shipped
-- sales order is invoiced in ScentsX's books through the EXISTING invoice engine (createExpandedInvoice +
-- createInvoiceLineInClientTx); this table records, per line, the units each invoice line bills, so a partial shipment is
-- invoiced exactly once and the next invoice bills only what shipped since. Every FK is real; the invoice must be ScentsX's
-- (same SECURITY DEFINER wall as 202616840100). Never deleted (no DELETE grant): a voided invoice frees its units because the
-- reader ignores lines of void invoices.

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.sales_order_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  so_line_id uuid NOT NULL REFERENCES perfume.sales_order_lines(id),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id),
  invoice_line_id uuid NOT NULL REFERENCES accounting.invoice_lines(id),
  qty integer NOT NULL CHECK (qty > 0),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_so_invoice_lines_invoice_line ON scentsx.sales_order_invoice_lines (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_so_invoice_lines_so_line ON scentsx.sales_order_invoice_lines (so_line_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_so_invoice_lines_invoice ON scentsx.sales_order_invoice_lines (invoice_id);

CREATE OR REPLACE FUNCTION scentsx.refuse_non_scentsx_invoice_line() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, accounting
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  v_inv uuid;
  v_line_inv uuid;
BEGIN
  IF v_sx IS NULL OR NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'scentsx sales-order invoice line must belong to SCENTSX' USING ERRCODE = 'check_violation';
  END IF;
  SELECT operating_company_id INTO v_inv FROM accounting.invoices WHERE id = NEW.invoice_id;
  SELECT invoice_id INTO v_line_inv FROM accounting.invoice_lines WHERE id = NEW.invoice_line_id;
  IF v_inv IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'a TIO Perfumes sales order may be invoiced only in ScentsX''s books (invoice company %)', v_inv USING ERRCODE = 'check_violation';
  END IF;
  IF v_line_inv IS DISTINCT FROM NEW.invoice_id THEN
    RAISE EXCEPTION 'invoice line % is not a line of invoice %', NEW.invoice_line_id, NEW.invoice_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_order_invoice_lines_scentsx_wall ON scentsx.sales_order_invoice_lines;
CREATE TRIGGER trg_sales_order_invoice_lines_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.sales_order_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_invoice_line();

ALTER TABLE scentsx.sales_order_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.sales_order_invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_order_invoice_lines_entity_select ON scentsx.sales_order_invoice_lines;
DROP POLICY IF EXISTS sales_order_invoice_lines_entity_write ON scentsx.sales_order_invoice_lines;
CREATE POLICY sales_order_invoice_lines_entity_select ON scentsx.sales_order_invoice_lines FOR SELECT
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY sales_order_invoice_lines_entity_write ON scentsx.sales_order_invoice_lines FOR ALL
  USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])));
GRANT SELECT, INSERT ON scentsx.sales_order_invoice_lines TO ih35_app;

COMMIT;
