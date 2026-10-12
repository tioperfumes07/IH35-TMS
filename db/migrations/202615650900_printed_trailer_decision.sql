-- RULING 443.90 #4 (CC-3): every printed trailer number on a document gets a DECISION. Our trailer -> trailer_id (existing
-- columns). Not ours anywhere (equipment master, Samsara) -> a customer / shipper trailer (drop & hook): one
-- dispatch.non_owned_trailers row per number, the load says trailer_source 'customer' and points at it, the expense points
-- at it. The printed number stays as document text (accounting.expenses.document_trailer_number). Additive only.
SET LOCAL lock_timeout = '60s';

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS trailer_source text;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS non_owned_trailer_id uuid REFERENCES dispatch.non_owned_trailers(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_trailer_source_check') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_trailer_source_check
      CHECK (trailer_source IS NULL OR trailer_source IN ('company', 'customer')) NOT VALID;
    ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_trailer_source_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_customer_trailer_named') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_customer_trailer_named
      CHECK (trailer_source IS DISTINCT FROM 'customer' OR non_owned_trailer_id IS NOT NULL) NOT VALID;
    ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_customer_trailer_named;
  END IF;
END $$;

ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS non_owned_trailer_id uuid REFERENCES dispatch.non_owned_trailers(id);
CREATE INDEX IF NOT EXISTS idx_expenses_non_owned_trailer ON accounting.expenses (non_owned_trailer_id) WHERE non_owned_trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loads_non_owned_trailer ON mdata.loads (non_owned_trailer_id) WHERE non_owned_trailer_id IS NOT NULL;
