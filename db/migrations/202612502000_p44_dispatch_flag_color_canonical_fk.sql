BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_flag_colors_company_id_id_key'
  ) THEN
    ALTER TABLE catalogs.dispatch_flag_colors
      ADD CONSTRAINT dispatch_flag_colors_company_id_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS dispatch_flag_color_id UUID;

UPDATE mdata.loads l
SET dispatch_flag_color_id = f.id
FROM catalogs.dispatch_flag_colors f
WHERE f.operating_company_id = l.operating_company_id
  AND f.flag_code = CASE
    WHEN l.status::text IN ('cancelled', 'abandoned', 'driver_walkoff', 'driver_no_show') THEN 'RED'
    WHEN l.status::text IN ('closed', 'paid', 'invoiced', 'completed_docs_received') THEN 'BLACK'
    WHEN l.status::text IN ('delivered', 'delivered_pending_docs') THEN 'GREEN'
    WHEN l.status::text IN ('at_pickup', 'in_transit', 'at_delivery') THEN 'BLUE'
    WHEN l.status::text IN ('assigned', 'assigned_not_dispatched', 'dispatched') THEN 'YELLOW'
    ELSE 'GRAY'
  END;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mdata.loads WHERE dispatch_flag_color_id IS NULL) THEN
    RAISE EXCEPTION 'P44 dispatch flag backfill left NULL load rows';
  END IF;
END $$;

ALTER TABLE mdata.loads
  ALTER COLUMN dispatch_flag_color_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_dispatch_flag_color_same_company_fk'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_dispatch_flag_color_same_company_fk
        FOREIGN KEY (operating_company_id, dispatch_flag_color_id)
        REFERENCES catalogs.dispatch_flag_colors (operating_company_id, id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION mdata.default_load_dispatch_flag_color()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.dispatch_flag_color_id IS NULL THEN
    SELECT f.id INTO NEW.dispatch_flag_color_id
    FROM catalogs.dispatch_flag_colors f
    WHERE f.operating_company_id = NEW.operating_company_id
      AND f.flag_code = CASE
        WHEN NEW.status::text IN ('cancelled', 'abandoned', 'driver_walkoff', 'driver_no_show') THEN 'RED'
        WHEN NEW.status::text IN ('closed', 'paid', 'invoiced', 'completed_docs_received') THEN 'BLACK'
        WHEN NEW.status::text IN ('delivered', 'delivered_pending_docs') THEN 'GREEN'
        WHEN NEW.status::text IN ('at_pickup', 'in_transit', 'at_delivery') THEN 'BLUE'
        WHEN NEW.status::text IN ('assigned', 'assigned_not_dispatched', 'dispatched') THEN 'YELLOW'
        ELSE 'GRAY'
      END
    LIMIT 1;
  END IF;
  IF NEW.dispatch_flag_color_id IS NULL THEN
    RAISE EXCEPTION 'No canonical dispatch flag color for operating company %', NEW.operating_company_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_load_default_dispatch_flag_color ON mdata.loads;
CREATE TRIGGER trg_load_default_dispatch_flag_color
  BEFORE INSERT ON mdata.loads
  FOR EACH ROW EXECUTE FUNCTION mdata.default_load_dispatch_flag_color();

COMMIT;
