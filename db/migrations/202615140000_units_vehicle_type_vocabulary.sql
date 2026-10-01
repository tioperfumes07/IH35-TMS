-- 202615140000_units_vehicle_type_vocabulary.sql
-- E-17 addition (registry 2026-10-01): "vehicle_type so E-02 can say 'trucks' not 'things with GPS'".
-- Measured 2026-10-01: mdata.units.vehicle_type is free text, 195 of 196 rows NULL, 1 'Tractor'; the
-- units "Truck" filter counted NULL as a truck, so the Tacoma pickup and the Versa cars counted as trucks.
-- A controlled vocabulary makes "truck" countable; NULL stays legal and means UNCLASSIFIED (never a
-- truck by default). The owner sets each unit's type -- this migration classifies nothing.
-- Additive: the only non-NULL value in production ('Tractor') is in the set. NOT VALID + VALIDATE keeps
-- the lock on mdata.units momentary (VALIDATE = SHARE UPDATE EXCLUSIVE); lock_timeout so it never queues.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'units_vehicle_type_vocabulary_check' AND conrelid = 'mdata.units'::regclass) THEN
    ALTER TABLE mdata.units ADD CONSTRAINT units_vehicle_type_vocabulary_check
      CHECK (vehicle_type IS NULL OR vehicle_type IN ('Tractor', 'Straight Truck', 'Box Truck', 'Pickup', 'Passenger Car', 'Other'))
      NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.units VALIDATE CONSTRAINT units_vehicle_type_vocabulary_check;

COMMENT ON COLUMN mdata.units.vehicle_type IS
  'Tractor | Straight Truck | Box Truck (= trucks) | Pickup | Passenger Car | Other. NULL = unclassified, never assumed a truck.';

COMMIT;
