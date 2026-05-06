BEGIN;

CREATE SCHEMA IF NOT EXISTS views;

DO $$
BEGIN
  IF current_setting('app.environment', true) = 'production' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'maintenance'
        AND table_name = 'work_orders'
    ) THEN
      RAISE EXCEPTION 'P3-T11.6 migration cannot run in production: maintenance.work_orders missing';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'dispatch'
        AND table_name = 'intransit_issues'
    ) THEN
      RAISE EXCEPTION 'P3-T11.6 migration cannot run in production: dispatch.intransit_issues missing';
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('dispatch.intransit_issues') IS NOT NULL
     AND to_regclass('mdata.units') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.maintenance_intransit_triage_queue AS
      SELECT
        i.id,
        i.reported_at,
        i.unit_id,
        i.driver_id,
        i.gps_lat,
        i.gps_lng,
        i.gps_label,
        i.issue_category,
        i.issue_description,
        i.severity,
        i.promoted_to_wo_id,
        i.promoted_to_damage_report_id,
        COALESCE(u.unit_number, '') AS unit_display_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
        EXTRACT(epoch FROM (now() - i.reported_at)) / 3600 AS hours_since_report
      FROM dispatch.intransit_issues i
      JOIN mdata.units u ON u.id = i.unit_id
      JOIN mdata.drivers d ON d.id = i.driver_id
      WHERE i.promoted_to_wo_id IS NULL
        AND i.promoted_to_damage_report_id IS NULL
      ORDER BY i.reported_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.maintenance_intransit_triage_queue AS
      SELECT
        NULL::uuid AS id,
        NULL::timestamptz AS reported_at,
        NULL::uuid AS unit_id,
        NULL::uuid AS driver_id,
        NULL::numeric AS gps_lat,
        NULL::numeric AS gps_lng,
        NULL::text AS gps_label,
        NULL::text AS issue_category,
        NULL::text AS issue_description,
        NULL::text AS severity,
        NULL::uuid AS promoted_to_wo_id,
        NULL::uuid AS promoted_to_damage_report_id,
        NULL::text AS unit_display_id,
        NULL::text AS driver_full_name,
        NULL::numeric AS hours_since_report
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NOT NULL
     AND to_regclass('mdata.units') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.maintenance_severe_repair_alerts AS
      SELECT
        w.id,
        COALESCE(w.display_id, w.id::text) AS wo_display_id,
        w.unit_id,
        w.opened_at,
        w.repair_location,
        w.assigned_vendor,
        w.total_estimated_cost,
        w.severity,
        w.status,
        COALESCE(u.unit_number, '') AS unit_display_id
      FROM maintenance.work_orders w
      JOIN mdata.units u ON u.id = w.unit_id
      WHERE w.status NOT IN ('complete', 'cancelled')
        AND (
          w.severity = 'severe'
          OR (w.status = 'waiting_parts' AND w.opened_at < now() - INTERVAL '5 days')
        )
      ORDER BY w.total_estimated_cost DESC NULLS LAST
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.maintenance_severe_repair_alerts AS
      SELECT
        NULL::uuid AS id,
        NULL::text AS wo_display_id,
        NULL::uuid AS unit_id,
        NULL::timestamptz AS opened_at,
        NULL::text AS repair_location,
        NULL::text AS assigned_vendor,
        NULL::numeric AS total_estimated_cost,
        NULL::text AS severity,
        NULL::text AS status,
        NULL::text AS unit_display_id
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.maintenance_dashboard_kpis AS
      SELECT
        operating_company_id,
        COUNT(*) FILTER (WHERE status NOT IN ('complete', 'cancelled')) AS open_wos,
        COUNT(*) FILTER (WHERE status = 'in_progress' AND repair_location = 'in_house') AS in_shop,
        AVG(EXTRACT(epoch FROM (now() - opened_at)) / 86400)
          FILTER (WHERE status NOT IN ('complete', 'cancelled')) AS avg_wo_age_days,
        SUM(total_actual_cost) FILTER (
          WHERE wo_type = 'repair'
            AND opened_at >= date_trunc('month', now())
        ) AS mtd_repair_cost,
        AVG(total_actual_cost) FILTER (
          WHERE status = 'complete'
            AND opened_at >= date_trunc('month', now())
        ) AS avg_wo_cost
      FROM maintenance.work_orders
      GROUP BY operating_company_id
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.maintenance_dashboard_kpis AS
      SELECT
        NULL::uuid AS operating_company_id,
        0::bigint AS open_wos,
        0::bigint AS in_shop,
        NULL::numeric AS avg_wo_age_days,
        NULL::numeric AS mtd_repair_cost,
        NULL::numeric AS avg_wo_cost
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;
