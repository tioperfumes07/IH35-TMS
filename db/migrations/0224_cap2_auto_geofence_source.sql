BEGIN;

ALTER TABLE geo.geofences
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'geo_geofences_source_check'
      AND conrelid = 'geo.geofences'::regclass
  ) THEN
    ALTER TABLE geo.geofences
      ADD CONSTRAINT geo_geofences_source_check
      CHECK (source IN ('manual', 'auto_dispatch'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_geo_geofences_source
  ON geo.geofences (operating_company_id, source, is_active);

COMMIT;
