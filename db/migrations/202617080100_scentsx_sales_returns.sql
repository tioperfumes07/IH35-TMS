-- SCENTSX sales returns — owner 2026-11-27 13:50 CT "lets incorporate what we need from here [CONTROL] in the app": CONTROL's
-- Returns (ticket → item → quantity returned → back to stock) and Shipper Export / Sales Void refunds, done the QuickBooks way.
--
-- A return is against one issued ScentsX invoice. The service (scentsx/returns.service.ts) writes, in ONE transaction:
--   * one credit memo per account through the existing credit-memo writer (accounting.createCreditMemoInClientTx — the same code
--     POST /api/v1/accounting/credit-memos runs): the merchandise to 4800 Sales Returns & Allowances, and the invoice's sales tax
--     on the returned part to the tax line's account (2100). Dr 4800 / Dr 2100, Cr A/R. Applied to the invoice while it still has an
--     open balance; otherwise left as the customer's credit.
--   * the units back to stock (when "back to stock") through the existing inventory engine — a 'return' stock move at the cost they
--     shipped at, which the stock-move poster books Dr Inventory / Cr COGS.
-- These two tables are the record of the return: what came back, from which invoice line, which credit memos and stock moves it
-- made. Never deleted; a return is reversed by voiding its credit memos (the existing void) — not here.

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  return_no text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  return_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('damaged', 'wrong_item', 'not_ordered', 'overshipped', 'customer_changed_mind', 'billing_error', 'other')),
  merchandise_cents bigint NOT NULL CHECK (merchandise_cents > 0),
  tax_cents bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  credit_memo_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_sales_return_no ON scentsx.sales_returns (operating_company_id, return_no);
CREATE INDEX IF NOT EXISTS idx_scentsx_sales_returns_invoice ON scentsx.sales_returns (invoice_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_sales_returns_customer ON scentsx.sales_returns (customer_id);

CREATE TABLE IF NOT EXISTS scentsx.sales_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  return_id uuid NOT NULL REFERENCES scentsx.sales_returns(id),
  so_line_id uuid NOT NULL REFERENCES perfume.sales_order_lines(id),
  item_id uuid REFERENCES perfume.items(id),
  qty integer NOT NULL CHECK (qty > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  restocked boolean NOT NULL,
  location_code text,
  unit_cost_cents bigint,
  stock_move_id uuid REFERENCES perfume.stock_moves(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT restocked OR (location_code IS NOT NULL AND stock_move_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_scentsx_sales_return_lines_return ON scentsx.sales_return_lines (return_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_sales_return_lines_so_line ON scentsx.sales_return_lines (so_line_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_returns', 'sales_return_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_scentsx_wall ON scentsx.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.%1$s FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_compliance_row()', t);
    EXECUTE format('ALTER TABLE scentsx.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE scentsx.%1$s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_entity_select ON scentsx.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_entity_write ON scentsx.%1$s', t);
    EXECUTE format($p$CREATE POLICY %1$s_entity_select ON scentsx.%1$s FOR SELECT
      USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_entity_write ON scentsx.%1$s FOR ALL
      USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
      WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT ON scentsx.%1$s TO ih35_app', t);
  END LOOP;
END $$;

COMMIT;
