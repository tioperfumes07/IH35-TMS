BEGIN;

ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS lumper_provider_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_lumper_provider_fk') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_lumper_provider_fk
      FOREIGN KEY (lumper_provider_id) REFERENCES catalogs.lumper_providers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_lumper_provider_required') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_lumper_provider_required
      CHECK (NOT lumper_required OR lumper_provider_id IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION mdata.enforce_load_stop_lumper_provider_company()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_load_company UUID; v_catalog_company UUID;
BEGIN
  IF NEW.lumper_provider_id IS NULL THEN RETURN NEW; END IF;
  SELECT operating_company_id INTO v_load_company FROM mdata.loads WHERE id=NEW.load_id;
  SELECT operating_company_id INTO v_catalog_company FROM catalogs.lumper_providers WHERE id=NEW.lumper_provider_id;
  IF v_load_company IS NULL OR v_catalog_company IS NULL OR v_load_company <> v_catalog_company THEN
    RAISE EXCEPTION 'lumper_provider_id must belong to the load operating company' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_load_stops_lumper_provider_company ON mdata.load_stops;
CREATE CONSTRAINT TRIGGER trg_load_stops_lumper_provider_company
AFTER INSERT OR UPDATE OF load_id, lumper_provider_id ON mdata.load_stops
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
EXECUTE FUNCTION mdata.enforce_load_stop_lumper_provider_company();

CREATE INDEX IF NOT EXISTS idx_load_stops_lumper_provider ON mdata.load_stops(lumper_provider_id)
WHERE lumper_provider_id IS NOT NULL;

COMMIT;
