-- SCENTSX M15 (LEAD ROUND L.32, owner 2026-11-27 19:38 CT "all fully completely done"): landed cost on a received PO. Freight-in
-- (5100) and customs / broker fees (5110) on the vendor's or the broker's bill are spread over the bill's stocked lines by billed value
-- and moved into the cost of the units still on hand (their lots' unit cost goes up; one balanced journal entry Dr Inventory / Cr
-- 5100 | 5110 through the one journal-entry writer). The share for units already shipped stays in 5100 / 5110 (cost of sales).
--
-- Measured on production 2026-11-28 02:30 UTC: ScentsX accounts 5100 Freight In and 5110 Customs Duties & Broker Fees exist (COGS
-- type, postable); 0 purchase orders, 0 bills.
--
-- CANONICAL-CHECK: landed_cost_crosswalk. scentsx.purchase_order_landed_costs is NOT a money ledger and NOT a second bill-line or
--   journal table: it names the canonical bill and journal entry and records, per (bill, PO line, lot), how much of the landed charge
--   was capitalized into that lot and how much stayed expensed. The money lives ONLY in accounting.bills / bill_lines (the one bill
--   writer) and accounting.journal_entries (the one journal-entry writer); the lot cost in perfume.inventory_lots.

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.purchase_order_landed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bill_id uuid NOT NULL REFERENCES accounting.bills(id),
  purchase_order_id uuid NOT NULL REFERENCES perfume.purchase_orders(id),
  po_line_id uuid NOT NULL REFERENCES perfume.purchase_order_lines(id),
  lot_id uuid REFERENCES perfume.inventory_lots(id),
  kind text NOT NULL CHECK (kind IN ('freight_in', 'customs')),
  allocated_cents bigint NOT NULL CHECK (allocated_cents >= 0),
  capitalized_cents bigint NOT NULL CHECK (capitalized_cents >= 0),
  expensed_cents bigint NOT NULL CHECK (expensed_cents >= 0),
  units_on_hand integer NOT NULL CHECK (units_on_hand >= 0),
  unit_cost_before numeric(14, 4),
  unit_cost_after numeric(14, 4),
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (capitalized_cents + expensed_cents = allocated_cents)
);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_landed_bill ON scentsx.purchase_order_landed_costs (bill_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_landed_po ON scentsx.purchase_order_landed_costs (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_po_landed_lot ON scentsx.purchase_order_landed_costs (lot_id);

DROP TRIGGER IF EXISTS trg_purchase_order_landed_costs_scentsx_wall ON scentsx.purchase_order_landed_costs;
CREATE TRIGGER trg_purchase_order_landed_costs_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.purchase_order_landed_costs
  FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_compliance_row();

ALTER TABLE scentsx.purchase_order_landed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.purchase_order_landed_costs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_landed_costs_entity_select ON scentsx.purchase_order_landed_costs;
DROP POLICY IF EXISTS purchase_order_landed_costs_entity_write ON scentsx.purchase_order_landed_costs;
CREATE POLICY purchase_order_landed_costs_entity_select ON scentsx.purchase_order_landed_costs FOR SELECT
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY purchase_order_landed_costs_entity_write ON scentsx.purchase_order_landed_costs FOR ALL
  USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])));
GRANT SELECT, INSERT ON scentsx.purchase_order_landed_costs TO ih35_app;

COMMIT;
