BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.locations') IS NOT NULL THEN
    ALTER TABLE mdata.locations
      ADD COLUMN IF NOT EXISTS is_ih35_yard boolean NOT NULL DEFAULT false;

    UPDATE mdata.locations
    SET is_ih35_yard = true
    WHERE is_ih35_yard = false
      AND (
        COALESCE(location_name, '') ILIKE '%IH35%yard%'
        OR COALESCE(location_name, '') ILIKE '%laredo%yard%'
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL
     AND to_regclass('dispatch.intransit_issues') IS NOT NULL
     AND to_regclass('dispatch.load_eta_predictions') IS NOT NULL
     AND to_regclass('mdata.units') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL
     AND to_regclass('mdata.load_stops') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW maintenance.v_arriving_soon
      WITH (security_invoker = true) AS
      WITH active_loads AS (
        SELECT
          l.id AS load_id,
          l.operating_company_id,
          l.assigned_unit_id AS unit_id,
          l.assigned_primary_driver_id AS driver_id,
          l.status::text AS load_status,
          COALESCE(l.load_number, l.id::text) AS load_display_id,
          fd.location_id AS final_destination_location_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          COALESCE(u.unit_number, u.id::text) AS unit_number
        FROM mdata.loads l
        JOIN mdata.units u ON u.id = l.assigned_unit_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
        LEFT JOIN LATERAL (
          SELECT ls.location_id
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
            AND ls.stop_type = 'delivery'
          ORDER BY ls.sequence_number DESC
          LIMIT 1
        ) fd ON true
        WHERE l.soft_deleted_at IS NULL
          AND l.status::text IN ('dispatched', 'in_transit', 'at_delivery', 'delivered_pending_docs')
      ),
      open_issues_per_load AS (
        SELECT
          al.load_id,
          jsonb_agg(
            jsonb_build_object(
              'issue_id', ii.id,
              'issue_type', COALESCE(ii.issue_category, 'other'),
              'severity', COALESCE(ii.severity, 'info'),
              'description', COALESCE(ii.issue_description, ''),
              'reported_at', ii.reported_at,
              'reported_lat', ii.gps_lat,
              'reported_lon', ii.gps_lng
            )
            ORDER BY ii.reported_at DESC
          ) AS issues_json,
          COUNT(*) FILTER (WHERE COALESCE(ii.severity, '') = 'severe') AS severe_count,
          COUNT(*) FILTER (WHERE COALESCE(ii.severity, '') = 'warning') AS warning_count,
          COUNT(*) FILTER (WHERE COALESCE(ii.severity, '') = 'info') AS info_count,
          COUNT(*) AS total_open_issues,
          MAX(ii.reported_at) AS most_recent_issue_at
        FROM active_loads al
        JOIN dispatch.intransit_issues ii
          ON ii.unit_id = al.unit_id
         AND ii.promoted_to_wo_id IS NULL
         AND ii.promoted_to_damage_report_id IS NULL
        GROUP BY al.load_id
      ),
      latest_eta AS (
        SELECT DISTINCT ON (load_id)
          load_id,
          predicted_arrival_at,
          confidence_class,
          computed_at
        FROM dispatch.load_eta_predictions
        ORDER BY load_id, computed_at DESC
      ),
      yard_check AS (
        SELECT
          al.load_id,
          al.unit_id,
          al.driver_id,
          al.unit_number,
          al.driver_name,
          al.load_display_id,
          al.load_status,
          al.operating_company_id,
          COALESCE(loc.is_ih35_yard, false) AS final_dest_is_yard,
          loc.location_name AS final_dest_name,
          loc.city AS final_dest_city,
          loc.state AS final_dest_state,
          le.predicted_arrival_at AS predicted_arrival_raw,
          le.confidence_class AS eta_confidence,
          oi.issues_json,
          oi.severe_count,
          oi.warning_count,
          oi.info_count,
          oi.total_open_issues,
          oi.most_recent_issue_at
        FROM active_loads al
        JOIN open_issues_per_load oi ON oi.load_id = al.load_id
        LEFT JOIN mdata.locations loc ON loc.id = al.final_destination_location_id
        LEFT JOIN latest_eta le ON le.load_id = al.load_id
      )
      SELECT
        yc.*,
        CASE
          WHEN yc.final_dest_is_yard = true THEN yc.predicted_arrival_raw + interval '30 minutes'
          ELSE NULL
        END AS predicted_yard_arrival_at,
        CASE
          WHEN yc.final_dest_is_yard = true AND yc.predicted_arrival_raw IS NOT NULL THEN
            EXTRACT(EPOCH FROM (yc.predicted_arrival_raw - now())) / 3600.0
          ELSE NULL
        END AS hours_until_yard_arrival,
        CASE
          WHEN yc.final_dest_is_yard = true
               AND yc.predicted_arrival_raw IS NOT NULL
               AND yc.predicted_arrival_raw <= now() THEN true
          ELSE false
        END AS already_arrived,
        CASE
          WHEN yc.severe_count > 0 THEN 0
          WHEN yc.warning_count > 0 THEN 1
          ELSE 2
        END AS severity_bucket,
        CASE
          WHEN yc.severe_count > 0 THEN 'IS'
          ELSE 'IS'
        END AS suggested_wo_source_type
      FROM yard_check yc
      WHERE yc.predicted_arrival_raw IS NULL
         OR yc.predicted_arrival_raw <= now() + interval '48 hours'
      ORDER BY
        COALESCE(yc.predicted_arrival_raw, now() + interval '999 days') ASC,
        CASE
          WHEN yc.severe_count > 0 THEN 0
          WHEN yc.warning_count > 0 THEN 1
          ELSE 2
        END ASC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW maintenance.v_arriving_soon
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS load_id,
        NULL::uuid AS operating_company_id,
        NULL::uuid AS unit_id,
        NULL::uuid AS driver_id,
        NULL::text AS load_status,
        NULL::text AS load_display_id,
        NULL::uuid AS final_destination_location_id,
        NULL::text AS driver_name,
        NULL::text AS unit_number,
        false AS final_dest_is_yard,
        NULL::text AS final_dest_name,
        NULL::text AS final_dest_city,
        NULL::text AS final_dest_state,
        NULL::timestamptz AS predicted_arrival_raw,
        NULL::text AS eta_confidence,
        '[]'::jsonb AS issues_json,
        0::bigint AS severe_count,
        0::bigint AS warning_count,
        0::bigint AS info_count,
        0::bigint AS total_open_issues,
        NULL::timestamptz AS most_recent_issue_at,
        NULL::timestamptz AS predicted_yard_arrival_at,
        NULL::numeric AS hours_until_yard_arrival,
        false AS already_arrived,
        2::int AS severity_bucket,
        'IS'::text AS suggested_wo_source_type
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('maintenance.arriving_soon.viewed'),
      ('maintenance.arriving_soon.converted_to_wo')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMIT;
