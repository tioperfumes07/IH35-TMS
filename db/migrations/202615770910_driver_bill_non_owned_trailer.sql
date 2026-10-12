-- 202615770910 · CC-3 · LEAD 443.105 item 1 — a driver bill carries the load's trailer.
-- accounting.bills already has trailer_id (company trailer, mdata.equipment, guarded by trg_xco_trailer_id). A load on a
-- CUSTOMER trailer (443.90 printed-trailer decision: mdata.loads.trailer_source = 'customer' + non_owned_trailer_id) has no
-- mdata.equipment row, so its bill needs the same non-owned reference accounting.expenses carries since 202615650900.
-- Same-entity composite FK like 202615700900 (the referenced (operating_company_id, id) key exists on
-- dispatch.non_owned_trailers). Additive, idempotent; every existing row is NULL so NOT VALID -> VALIDATE has 0 orphans.
BEGIN;

ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS non_owned_trailer_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_non_owned_trailer_same_entity_fkey') THEN
    ALTER TABLE accounting.bills ADD CONSTRAINT bills_non_owned_trailer_same_entity_fkey
      FOREIGN KEY (operating_company_id, non_owned_trailer_id) REFERENCES dispatch.non_owned_trailers (operating_company_id, id) NOT VALID;
    ALTER TABLE accounting.bills VALIDATE CONSTRAINT bills_non_owned_trailer_same_entity_fkey;
  END IF;
  -- a bill names one trailer kind: its own equipment OR a customer's trailer, never both.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_one_trailer_kind') THEN
    ALTER TABLE accounting.bills ADD CONSTRAINT bills_one_trailer_kind
      CHECK (trailer_id IS NULL OR non_owned_trailer_id IS NULL) NOT VALID;
    ALTER TABLE accounting.bills VALIDATE CONSTRAINT bills_one_trailer_kind;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bills_non_owned_trailer ON accounting.bills (non_owned_trailer_id) WHERE non_owned_trailer_id IS NOT NULL;

COMMENT ON COLUMN accounting.bills.non_owned_trailer_id IS
  'LEAD 443.105: the customer (non-owned) trailer of the bill''s load — set when mdata.loads.trailer_source = ''customer''; trailer_id carries a company trailer. Written by the driver-bill writers and the Owner stamp (bill-trailer-stamp.service.ts).';

COMMIT;
