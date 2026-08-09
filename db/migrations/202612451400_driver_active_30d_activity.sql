-- DRV-ACTIVE-30D — Owner 2026-08-08: Active = activity in last 30 days; others Inactive.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a (bypass_rls=lucia, 2026-08-09):
--   TRANSP status=Active 87 · keep (load|drive|hire grace) 21 · soft-deactivate candidates 66
--   USMCA  status=Active 26 · keep 12 · soft-deactivate candidates 14
--
-- Activity = load assign (primary/secondary) in 30d OR telematics vehicle assignment
-- (open or ended within 30d) OR hire_date/created_at within 30d. Terminated never touched.
-- Does NOT deactivate identity.users (roster Inactive ≠ PWA lockout).
--
-- Idempotent. Re-run safe. Companion service: mdata/driver-active-30d.service.ts + daily worker.
-- REHEARSED: applied twice on throwaway Postgres (apply-twice) before Neon; counts match preview.

DO $$
DECLARE
  deactivated_n int := 0;
  reactivated_n int := 0;
  has_telematics boolean := to_regclass('telematics.vehicle_driver_assignments') IS NOT NULL;
  activity_sql text;
BEGIN
  IF to_regclass('mdata.drivers') IS NULL THEN
    RAISE NOTICE 'DRV-ACTIVE-30D: mdata.drivers absent — skip';
    RETURN;
  END IF;

  IF has_telematics THEN
    activity_sql := $A$
      (
        EXISTS (
          SELECT 1
            FROM mdata.loads l
           WHERE l.soft_deleted_at IS NULL
             AND (l.assigned_primary_driver_id = d.id OR l.assigned_secondary_driver_id = d.id)
             AND COALESCE(l.updated_at, l.created_at) >= now() - interval '30 days'
        )
        OR EXISTS (
          SELECT 1
            FROM telematics.vehicle_driver_assignments a
           WHERE a.driver_id = d.id
             AND a.operating_company_id = d.operating_company_id
             AND (
               a.ended_at IS NULL
               OR COALESCE(a.ended_at, a.started_at) >= now() - interval '30 days'
             )
        )
        OR (d.hire_date IS NOT NULL AND d.hire_date >= CURRENT_DATE - 30)
        OR d.created_at >= now() - interval '30 days'
      )
    $A$;
  ELSE
    RAISE NOTICE 'DRV-ACTIVE-30D: telematics.vehicle_driver_assignments absent — load/hire signals only';
    activity_sql := $A$
      (
        EXISTS (
          SELECT 1
            FROM mdata.loads l
           WHERE l.soft_deleted_at IS NULL
             AND (l.assigned_primary_driver_id = d.id OR l.assigned_secondary_driver_id = d.id)
             AND COALESCE(l.updated_at, l.created_at) >= now() - interval '30 days'
        )
        OR (d.hire_date IS NOT NULL AND d.hire_date >= CURRENT_DATE - 30)
        OR d.created_at >= now() - interval '30 days'
      )
    $A$;
  END IF;

  EXECUTE format($U$
    UPDATE mdata.drivers d
       SET status = 'Inactive'::mdata.driver_status,
           deactivated_at = COALESCE(d.deactivated_at, now()),
           updated_at = now()
     WHERE d.archived_at IS NULL
       AND d.status IS DISTINCT FROM 'Terminated'::mdata.driver_status
       AND d.status IS DISTINCT FROM 'Inactive'::mdata.driver_status
       AND d.deactivated_at IS NULL
       AND NOT %s
  $U$, activity_sql);
  GET DIAGNOSTICS deactivated_n = ROW_COUNT;

  EXECUTE format($U$
    UPDATE mdata.drivers d
       SET status = 'Active'::mdata.driver_status,
           deactivated_at = NULL,
           updated_at = now()
     WHERE d.archived_at IS NULL
       AND d.status = 'Inactive'::mdata.driver_status
       AND d.deactivated_at IS NOT NULL
       AND %s
  $U$, activity_sql);
  GET DIAGNOSTICS reactivated_n = ROW_COUNT;

  RAISE NOTICE 'DRV-ACTIVE-30D: deactivated=% reactivated=%', deactivated_n, reactivated_n;
END $$;
