-- 202614800000_pm_schedules_usmca_16units.sql
-- ROUND 297.2 A-28 (Lead order, owner-approved, 2026-09-30): one maintenance.pm_schedules row per
-- (unit, interval) for the real USMCA fleet -- live-verified 16 real, active, non-sample units
-- (mdata.units WHERE (owner_company_id = USMCA OR currently_leased_to_company_id = USMCA) AND
-- is_sample_data IS NOT TRUE AND deactivated_at IS NULL), x the 6 real intervals from
-- catalogs.pm_intervals (202614790000). 96 rows total.
--
-- HARD RULE (order's own wording): "do NOT seed last_service_odometer from the current odometer.
-- That silently declares every truck freshly serviced today." Every row below is inserted with
-- last_service_odometer = NULL and next_due_odometer = NULL, regardless of mdata.units.odometer_mi
-- being populated for most of these units -- there is no real backfilled service record yet, so
-- there is nothing to compute a due date FROM. The UI renders these as "awaiting first service
-- record." The owner backfills real numbers through the route in 202614780000/A-29's follow-up
-- (apps/backend/src/maintenance/service-history-backfill.routes.ts), which is the only writer
-- permitted to populate these two columns.
--
-- Writes ONLY maintenance.pm_schedules (canonical). Never maint.pm_schedule (frozen, NEVER-WRITE
-- list, 24 rows, untouched by this migration).
--
-- Additive, idempotent (ON CONFLICT DO NOTHING on (operating_company_id, unit_id, label)), CREATE-
-- only.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'maintenance.pm_schedules'::regclass
      AND pg_get_constraintdef(oid) LIKE '%operating_company_id, unit_id, label%'
  ) THEN
    EXECUTE 'ALTER TABLE maintenance.pm_schedules ADD CONSTRAINT pm_schedules_company_unit_label_key UNIQUE (operating_company_id, unit_id, label)';
  END IF;
END $$;

DO $$
DECLARE
  usmca_id uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
BEGIN
  -- maintenance.pm_schedules.interval_kind is CHECK-constrained to ('miles','hours','days') --
  -- narrower than catalogs.pm_intervals.metadata's 'months' unit. Converted here at seed time
  -- (months * 30 -> days); catalogs.pm_intervals keeps 'months' as its own natural display unit,
  -- unaffected by this table's constraint.
  INSERT INTO maintenance.pm_schedules
    (id, operating_company_id, unit_id, label, interval_kind, interval_value,
     last_service_odometer, next_due_odometer, is_active, created_at)
  SELECT
    gen_random_uuid(),
    usmca_id,
    u.id,
    pmi.code,
    CASE WHEN (pmi.metadata->>'interval_kind') = 'months' THEN 'days' ELSE (pmi.metadata->>'interval_kind') END,
    CASE WHEN (pmi.metadata->>'interval_kind') = 'months' THEN (pmi.metadata->>'interval_value')::integer * 30
         ELSE (pmi.metadata->>'interval_value')::integer END,
    NULL,
    NULL,
    true,
    now()
  FROM mdata.units u
  CROSS JOIN catalogs.pm_intervals pmi
  WHERE (u.owner_company_id = usmca_id OR u.currently_leased_to_company_id = usmca_id)
    AND (u.is_sample_data IS NOT TRUE)
    AND u.deactivated_at IS NULL
    AND pmi.operating_company_id = usmca_id
    AND pmi.is_active = true
  ON CONFLICT (operating_company_id, unit_id, label) DO NOTHING;
END $$;

COMMIT;
