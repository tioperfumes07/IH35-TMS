-- 202614490000_samsara_vehicles_unique_local_unit.sql
--
-- ROUND 168 JOB 3 side finding: integrations.samsara_vehicles had 14 local units each mapped to
-- 2-4 different samsara_vehicle_id rows (T156 alone had 3) -- one real/live vehicle ID and the
-- rest stale duplicates from an earlier import, with nothing stopping a local truck from being
-- mapped to more than one Samsara vehicle. Live-cleaned in the same round (19 duplicate rows
-- removed, keeping the one matching a real, currently-live telematics.vehicle_latest_position row
-- per unit). This migration is the permanent guard: UNIQUE (operating_company_id, local_unit_id)
-- so a second mapping for the same truck can never be inserted again.
--
-- Idempotent, additive only. Refuses to apply if a live duplicate still exists (the data fix must
-- land first, same pattern as 202614440000's non_owned_trailers uniqueness migration).

DO $$
BEGIN
  IF to_regclass('integrations.samsara_vehicles') IS NULL THEN
    RAISE NOTICE '202614490000: integrations.samsara_vehicles absent -- skipped';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM integrations.samsara_vehicles
     GROUP BY operating_company_id, local_unit_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '202614490000: a live (operating_company_id, local_unit_id) duplicate still exists in integrations.samsara_vehicles -- dedupe it first, then re-run.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'integrations' AND tablename = 'samsara_vehicles'
       AND indexname = 'uq_samsara_vehicles_company_local_unit'
  ) THEN
    CREATE UNIQUE INDEX uq_samsara_vehicles_company_local_unit
      ON integrations.samsara_vehicles (operating_company_id, local_unit_id);
  END IF;
END $$;
