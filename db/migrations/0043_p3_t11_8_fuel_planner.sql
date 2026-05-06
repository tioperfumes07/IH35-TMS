BEGIN;

CREATE SCHEMA IF NOT EXISTS fuel;
CREATE SCHEMA IF NOT EXISTS views;

CREATE TABLE IF NOT EXISTS fuel.fuel_planner_settings (
  operating_company_id uuid PRIMARY KEY,
  expensive_states text[] NOT NULL DEFAULT ARRAY['NY','PA','NJ','CA','IL','OR','WA','HI'],
  max_off_highway_miles numeric DEFAULT 5,
  max_backwards_miles numeric DEFAULT 5,
  max_miles_per_shift numeric DEFAULT 720,
  overfill_threshold_pct numeric DEFAULT 95,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid
);

ALTER TABLE fuel.fuel_planner_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_planner_settings_select ON fuel.fuel_planner_settings;
CREATE POLICY fuel_planner_settings_select
  ON fuel.fuel_planner_settings
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

DROP POLICY IF EXISTS fuel_planner_settings_insert ON fuel.fuel_planner_settings;
CREATE POLICY fuel_planner_settings_insert
  ON fuel.fuel_planner_settings
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

DROP POLICY IF EXISTS fuel_planner_settings_update ON fuel.fuel_planner_settings;
CREATE POLICY fuel_planner_settings_update
  ON fuel.fuel_planner_settings
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON fuel.fuel_planner_settings TO ih35_app;

DO $$
BEGIN
  IF to_regclass('fuel.route_recommendations') IS NOT NULL
     AND to_regclass('mdata.loads') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL
     AND to_regclass('mdata.units') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.fuel_planner_active_routes
      WITH (security_invoker = true)
      AS
      SELECT
        r.id,
        r.operating_company_id,
        r.load_id,
        r.computed_at,
        r.driver_id,
        r.unit_id,
        r.total_distance_miles,
        r.recommended_total_fuel_gallons,
        r.recommended_total_cost,
        r.station_avg_baseline_cost,
        r.savings_estimate,
        r.savings_percent,
        l.load_number AS load_display_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
        d.id::text AS driver_display_id,
        COALESCE(u.unit_number, u.id::text) AS unit_display_id,
        NULL::numeric AS current_fuel_gallons,
        NULL::numeric AS fuel_capacity_gallons,
        NULL::numeric AS current_mpg
      FROM fuel.route_recommendations r
      JOIN mdata.loads l ON l.id = r.load_id
      JOIN mdata.drivers d ON d.id = r.driver_id
      JOIN mdata.units u ON u.id = r.unit_id
      WHERE l.status IN ('dispatched'::mdata.load_status_enum, 'in_transit'::mdata.load_status_enum)
      ORDER BY r.computed_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.fuel_planner_active_routes
      WITH (security_invoker = true)
      AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS operating_company_id,
        NULL::uuid AS load_id,
        NULL::timestamptz AS computed_at,
        NULL::uuid AS driver_id,
        NULL::uuid AS unit_id,
        NULL::numeric AS total_distance_miles,
        NULL::numeric AS recommended_total_fuel_gallons,
        NULL::numeric AS recommended_total_cost,
        NULL::numeric AS station_avg_baseline_cost,
        NULL::numeric AS savings_estimate,
        NULL::numeric AS savings_percent,
        NULL::text AS load_display_id,
        NULL::text AS driver_full_name,
        NULL::text AS driver_display_id,
        NULL::text AS unit_display_id,
        NULL::numeric AS current_fuel_gallons,
        NULL::numeric AS fuel_capacity_gallons,
        NULL::numeric AS current_mpg
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('fuel.relay_matches') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.fuel_compliance_summary
      WITH (security_invoker = true)
      AS
      SELECT
        operating_company_id,
        driver_id,
        COUNT(*) FILTER (WHERE matched = true) AS matched_count,
        COUNT(*) AS total_recs,
        ROUND(100.0 * COUNT(*) FILTER (WHERE matched = true) / NULLIF(COUNT(*), 0), 1) AS pct_followed
      FROM fuel.relay_matches
      WHERE matched_at >= date_trunc('year', now())
      GROUP BY operating_company_id, driver_id
    $VIEW$;

    EXECUTE $VIEW2$
      CREATE OR REPLACE VIEW views.fuel_savings_summary
      WITH (security_invoker = true)
      AS
      SELECT
        operating_company_id,
        driver_id,
        SUM(recommended_savings_dollars) AS savings_ytd,
        SUM(missed_savings_dollars) AS lost_savings_ytd
      FROM fuel.relay_matches
      WHERE matched_at >= date_trunc('year', now())
      GROUP BY operating_company_id, driver_id
    $VIEW2$;
  ELSE
    EXECUTE $EMPTY1$
      CREATE OR REPLACE VIEW views.fuel_compliance_summary
      WITH (security_invoker = true)
      AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS driver_id,
        0::bigint AS matched_count,
        0::bigint AS total_recs,
        NULL::numeric AS pct_followed
      WHERE false
    $EMPTY1$;

    EXECUTE $EMPTY2$
      CREATE OR REPLACE VIEW views.fuel_savings_summary
      WITH (security_invoker = true)
      AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS driver_id,
        NULL::numeric AS savings_ytd,
        NULL::numeric AS lost_savings_ytd
      WHERE false
    $EMPTY2$;
  END IF;
END
$$;

COMMIT;
