-- SCENTSX vendor credits for goods returned after they were billed — owner 2026-11-27 15:05 CT "fully wire … liabilities … ap …
-- vendors". Since #29956 a return to the vendor posts Dr GRNI / Cr Inventory (it reverses the receipt). When those units were already
-- on a vendor bill, A/P still shows the full bill and GRNI holds the return's debit: the vendor owes TIO a credit.
-- The service (scentsx/purchase-bill.service.ts creditVendorReturn) issues it through the ONE vendor-credit writer
-- (accounting.createVendorCreditInClientTx: number, Dr A/P 2000 / Cr GRNI 2050, audit) at the vendor's billed price for the units, and
-- moves any difference against the received cost between GRNI and COGS through the shared journal-entry writer, in ONE transaction,
-- so GRNI nets to zero for the returned units. The credit is applied to an open bill by the existing apply route.
-- This table is the record of which billed PO-line units each vendor credit covers, so a returned unit is credited once; a voided
-- vendor credit frees its units (the read skips voided credits). Never deleted.

BEGIN;

-- CANONICAL-CHECK: purchase_order_credit_crosswalk. scentsx.purchase_order_vendor_credit_lines is NOT a money ledger and NOT a second
--   vendor-credit table: it posts nothing and names no account. It is a crosswalk row per (perfume PO line → vendor credit) carrying
--   the UNITS credited, the GRNI value those units carried and the vendor's price for them. The money lives ONLY in the canonical
--   accounting.vendor_credits (written by the one vendor-credit writer) and accounting.journal_entries. It mirrors
--   scentsx.purchase_order_bill_lines (202617120100) on the credit side.
CREATE TABLE IF NOT EXISTS scentsx.purchase_order_vendor_credit_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  po_line_id uuid NOT NULL REFERENCES perfume.purchase_order_lines(id),
  purchase_order_id uuid NOT NULL REFERENCES perfume.purchase_orders(id),
  vendor_credit_id uuid NOT NULL REFERENCES accounting.vendor_credits(id),
  qty integer NOT NULL CHECK (qty > 0),
  received_value_cents bigint NOT NULL CHECK (received_value_cents >= 0),
  credited_value_cents bigint NOT NULL CHECK (credited_value_cents >= 0),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_vc_lines_po_line ON scentsx.purchase_order_vendor_credit_lines (po_line_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_vc_lines_po ON scentsx.purchase_order_vendor_credit_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_vc_lines_vc ON scentsx.purchase_order_vendor_credit_lines (vendor_credit_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_order_vendor_credit_lines'] LOOP
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
