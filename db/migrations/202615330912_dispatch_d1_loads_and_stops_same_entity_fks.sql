-- 202615330912 · CC-3 · Dispatch D1 (the block, dispatch core) — every company-bearing foreign key on mdata.loads and
-- mdata.load_stops gets a composite (operating_company_id, x) -> parent (operating_company_id, id) twin repeating its
-- ON DELETE (factoring vendor: SET NULL on that column only, so the load never loses its company). Measured on prod under
-- SET LOCAL app.bypass_rls = 'lucia' (2026-10-03): 0 cross-company rows and 0 company-less parents on all 11 — each is
-- added NOT VALID, then VALIDATED. mdata.units / identity.users carry no company column (fleet + people are org-wide):
-- not company-bearing, not covered.
-- Idempotent. History is not modified.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_primary_driver_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_primary_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, assigned_primary_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_primary_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_secondary_driver_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_secondary_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, assigned_secondary_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_secondary_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_accepted_by_driver_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_accepted_by_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, accepted_by_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_accepted_by_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_split_primary_driver_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_split_primary_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, team_split_override_primary_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_split_primary_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_split_secondary_driver_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_split_secondary_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, team_split_override_secondary_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_split_secondary_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_instructions_file_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_instructions_file_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_instructions_file_id) REFERENCES docs.files (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_instructions_file_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.loads'::regclass AND conname = 'loads_factoring_vendor_same_entity_fkey') THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_factoring_vendor_same_entity_fkey
      FOREIGN KEY (operating_company_id, factoring_company_vendor_id) REFERENCES mdata.vendors (operating_company_id, id) ON DELETE SET NULL (factoring_company_vendor_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_factoring_vendor_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.load_stops'::regclass AND conname = 'load_stops_load_same_entity_fkey') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.load_stops VALIDATE CONSTRAINT load_stops_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.load_stops'::regclass AND conname = 'load_stops_location_same_entity_fkey') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_location_same_entity_fkey
      FOREIGN KEY (operating_company_id, location_id) REFERENCES mdata.locations (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.load_stops VALIDATE CONSTRAINT load_stops_location_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.load_stops'::regclass AND conname = 'load_stops_pickup_time_type_same_entity_fkey') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_pickup_time_type_same_entity_fkey
      FOREIGN KEY (operating_company_id, pickup_time_type_id) REFERENCES catalogs.pickup_time_types (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.load_stops VALIDATE CONSTRAINT load_stops_pickup_time_type_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'mdata.load_stops'::regclass AND conname = 'load_stops_lumper_provider_same_entity_fkey') THEN
    ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_lumper_provider_same_entity_fkey
      FOREIGN KEY (operating_company_id, lumper_provider_id) REFERENCES catalogs.lumper_providers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.load_stops VALIDATE CONSTRAINT load_stops_lumper_provider_same_entity_fkey;
