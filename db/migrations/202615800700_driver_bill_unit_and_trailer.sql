-- 202615800700_driver_bill_unit_and_trailer.sql
-- CC-2 · LEAD RULING 443.110 G9 (owner 2026-10-12 09:50 CT: "full mapping of what creating a load ... does and everything it
-- impacts"; owner 2026-10-01 no-handoff). driver_finance.driver_bills carried the load, the driver and the pay but neither the
-- truck nor the trailer that earned it — every report by unit / trailer had to re-join through the load.
--
-- Adds, exactly like accounting.bills already carries them (bills_unit_id_fkey, bills_trailer_id_fkey,
-- bills_non_owned_trailer_same_entity_fkey, bills_one_trailer_kind, trg_xco_unit_id / trg_xco_trailer_id):
--   unit_id              -> mdata.units(id)            (the load's assigned_unit_id)
--   trailer_id           -> mdata.equipment(id)        (company trailer: owned / leased by the load's company)
--   non_owned_trailer_id -> dispatch.non_owned_trailers (customer / shipper trailer), same-company composite FK
--   at most one trailer kind per bill; cross-company unit / trailer refused by mdata.refuse_cross_company_reference.
-- Stamped by the writers through apps/backend/src/driver-finance/driver-bill-unit-trailer.ts (one rule:
-- accounting/load-trailer.sql.ts). Nullable; existing rows stay NULL (prod back-stamp only through an AUTH engine run).
-- Idempotent; lock_timeout 60s.
BEGIN;
SET LOCAL lock_timeout = '60s';

ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);
ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS trailer_id uuid REFERENCES mdata.equipment(id);
ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS non_owned_trailer_id uuid REFERENCES dispatch.non_owned_trailers(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_bills_non_owned_trailer_same_entity_fkey') THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_non_owned_trailer_same_entity_fkey
      FOREIGN KEY (operating_company_id, non_owned_trailer_id) REFERENCES dispatch.non_owned_trailers (operating_company_id, id) NOT VALID;
    ALTER TABLE driver_finance.driver_bills VALIDATE CONSTRAINT driver_bills_non_owned_trailer_same_entity_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_bills_one_trailer_kind') THEN
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_one_trailer_kind CHECK (trailer_id IS NULL OR non_owned_trailer_id IS NULL) NOT VALID;
    ALTER TABLE driver_finance.driver_bills VALIDATE CONSTRAINT driver_bills_one_trailer_kind;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_xco_unit_id ON driver_finance.driver_bills;
CREATE TRIGGER trg_xco_unit_id BEFORE INSERT OR UPDATE OF unit_id ON driver_finance.driver_bills
  FOR EACH ROW EXECUTE FUNCTION mdata.refuse_cross_company_reference('unit_id', 'unit');
DROP TRIGGER IF EXISTS trg_xco_trailer_id ON driver_finance.driver_bills;
CREATE TRIGGER trg_xco_trailer_id BEFORE INSERT OR UPDATE OF trailer_id ON driver_finance.driver_bills
  FOR EACH ROW EXECUTE FUNCTION mdata.refuse_cross_company_reference('trailer_id', 'equipment');

CREATE INDEX IF NOT EXISTS idx_driver_bills_unit_id ON driver_finance.driver_bills (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_bills_trailer_id ON driver_finance.driver_bills (trailer_id) WHERE trailer_id IS NOT NULL;

COMMENT ON COLUMN driver_finance.driver_bills.unit_id IS 'LEAD 443.110 G9: the truck of the bill''s load (mdata.loads.assigned_unit_id), stamped at mint.';
COMMENT ON COLUMN driver_finance.driver_bills.trailer_id IS 'LEAD 443.110 G9: the company trailer of the bill''s load (accounting/load-trailer.sql.ts), stamped at mint.';
COMMENT ON COLUMN driver_finance.driver_bills.non_owned_trailer_id IS 'LEAD 443.110 G9: the customer / shipper trailer of the bill''s load (trailer_source = customer), stamped at mint.';

COMMIT;
