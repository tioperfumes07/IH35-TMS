-- SCENTSX purchase bills — owner 2026-11-27 15:05 CT "perfumes only build, code, work, fully wire, reverse route, double, wire
-- mechanical, economic, financial, money, chart of accounts, liabilities, assets, ap, ar, customers, vendors".
--
-- The purchasing chain of TIO Perfumes stopped at the receipt: receiving a perfume PO posts Dr Inventory 1200 / Cr Goods Received
-- Not Billed 2050 (stock-move poster), and nothing ever moved GRNI to Accounts Payable — no vendor bill, no A/P, no vendor payment.
-- The service (scentsx/purchase-bill.service.ts) bills received units through the existing bill writer (createBillInClientTx) and the
-- existing bill poster (postBillDocumentInClientTx), in ONE transaction:
--   * one bill line per PO line to GRNI 2050 at the VENDOR's price for the units billed,
--   * any other charge (freight, handling) as a line to the ScentsX account picked for it,
--   * when the vendor's price differs from the received cost, the difference between GRNI and Cost of Goods Sold 5000 through the
--     shared journal-entry writer (received − billed > 0 → Dr GRNI / Cr COGS; < 0 → Dr COGS / Cr GRNI), so GRNI clears exactly.
-- Bill: Dr 2050 (+ Dr charge accounts) / Cr A/P 2000. This table is the record of which PO line units are on which bill,
-- so a received unit is billed exactly once; a voided bill frees its units (the read skips voided bills). Never deleted.

BEGIN;

-- CANONICAL-CHECK: purchase_order_billing_crosswalk. scentsx.purchase_order_bill_lines is NOT a money ledger and NOT a second
--   bill-line table: it posts nothing and names no account. It is a crosswalk row per (perfume PO line → A/P bill) carrying the
--   UNITS billed and the GRNI value those units carried (so a received unit is billed once and GRNI clears exactly). The money lives
--   ONLY in the canonical accounting.bills / accounting.bill_lines (written by the existing bill writer) and their journal entries
--   in accounting.journal_entries. It mirrors scentsx.sales_order_invoice_lines on the sales side.
CREATE TABLE IF NOT EXISTS scentsx.purchase_order_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  po_line_id uuid NOT NULL REFERENCES perfume.purchase_order_lines(id),
  purchase_order_id uuid NOT NULL REFERENCES perfume.purchase_orders(id),
  bill_id uuid NOT NULL REFERENCES accounting.bills(id),
  qty integer NOT NULL CHECK (qty > 0),
  received_value_cents bigint NOT NULL CHECK (received_value_cents >= 0),
  billed_value_cents bigint NOT NULL CHECK (billed_value_cents >= 0),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_bill_lines_po_line ON scentsx.purchase_order_bill_lines (po_line_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_bill_lines_po ON scentsx.purchase_order_bill_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_bill_lines_bill ON scentsx.purchase_order_bill_lines (bill_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_order_bill_lines'] LOOP
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
