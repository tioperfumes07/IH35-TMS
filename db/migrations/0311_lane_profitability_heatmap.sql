-- Block 19: Lane profitability heatmap — cache table + monthly materialized view refresh
BEGIN;

CREATE TABLE IF NOT EXISTS reports.lane_profitability_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  origin_city TEXT NOT NULL,
  origin_state TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  destination_state TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  load_count INTEGER NOT NULL DEFAULT 0,
  total_revenue_cents BIGINT NOT NULL DEFAULT 0,
  total_fuel_cost_cents BIGINT NOT NULL DEFAULT 0,
  total_driver_pay_cents BIGINT NOT NULL DEFAULT 0,
  total_maintenance_cost_cents BIGINT NOT NULL DEFAULT 0,
  total_miles INTEGER NOT NULL DEFAULT 0,
  gross_profit_cents BIGINT NOT NULL DEFAULT 0,
  profit_per_mile_cents INTEGER,
  profit_per_load_cents BIGINT,
  margin_pct NUMERIC,
  avg_deadhead_pct NUMERIC,
  last_load_date DATE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lane_profit_company ON reports.lane_profitability_cache(operating_company_id);
CREATE INDEX IF NOT EXISTS idx_lane_profit_lane ON reports.lane_profitability_cache(origin_city, origin_state, destination_city, destination_state);
CREATE INDEX IF NOT EXISTS idx_lane_profit_period ON reports.lane_profitability_cache(period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lane_profit_company_lane_period
  ON reports.lane_profitability_cache(
    operating_company_id,
    origin_city,
    origin_state,
    destination_city,
    destination_state,
    period_start,
    period_end
  );

ALTER TABLE reports.lane_profitability_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lane_profit_company_isolation ON reports.lane_profitability_cache;
CREATE POLICY lane_profit_company_isolation ON reports.lane_profitability_cache
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON reports.lane_profitability_cache TO ih35_app;

-- Monthly lane metrics materialized view (dispatch.loads + telematics deadhead columns)
DROP MATERIALIZED VIEW IF EXISTS reports.lane_metrics_monthly;

CREATE MATERIALIZED VIEW reports.lane_metrics_monthly AS
WITH pickup AS (
  SELECT DISTINCT ON (ls.load_id)
    ls.load_id,
    NULLIF(trim(ls.city), '') AS origin_city,
    NULLIF(trim(ls.state), '') AS origin_state
  FROM mdata.load_stops ls
  WHERE ls.stop_type = 'pickup'
  ORDER BY ls.load_id, ls.sequence_number ASC
),
delivery AS (
  SELECT DISTINCT ON (ls.load_id)
    ls.load_id,
    NULLIF(trim(ls.city), '') AS destination_city,
    NULLIF(trim(ls.state), '') AS destination_state
  FROM mdata.load_stops ls
  WHERE ls.stop_type = 'delivery'
  ORDER BY ls.load_id, ls.sequence_number DESC
),
load_scope AS (
  SELECT
    l.id,
    l.operating_company_id,
    date_trunc('month', l.created_at)::date AS month_start,
    (date_trunc('month', l.created_at) + interval '1 month - 1 day')::date AS month_end,
    p.origin_city,
    p.origin_state,
    d.destination_city,
    d.destination_state,
    COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents,
    COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles,
    COALESCE(l.loaded_miles, l.miles_practical, l.miles_shortest, 0)::bigint AS loaded_miles,
    COALESCE(l.deadhead_miles_to_pickup, l.miles_deadhead, 0)::bigint AS deadhead_miles
  FROM mdata.loads l
  JOIN pickup p ON p.load_id = l.id
  JOIN delivery d ON d.load_id = l.id
  WHERE l.soft_deleted_at IS NULL
    AND p.origin_city IS NOT NULL
    AND p.origin_state IS NOT NULL
    AND d.destination_city IS NOT NULL
    AND d.destination_state IS NOT NULL
)
SELECT
  ls.operating_company_id,
  ls.origin_city,
  ls.origin_state,
  ls.destination_city,
  ls.destination_state,
  ls.month_start,
  ls.month_end,
  COUNT(*)::int AS load_count,
  COALESCE(SUM(ls.revenue_cents), 0)::bigint AS total_revenue_cents,
  COALESCE(SUM(ls.trip_miles), 0)::bigint AS total_miles,
  CASE
    WHEN SUM(ls.loaded_miles + ls.deadhead_miles) > 0
    THEN ROUND((SUM(ls.deadhead_miles)::numeric / SUM(ls.loaded_miles + ls.deadhead_miles)::numeric) * 100, 2)
    ELSE NULL
  END AS avg_deadhead_pct,
  MAX(l.created_at)::date AS last_load_date
FROM load_scope ls
JOIN mdata.loads l ON l.id = ls.id
GROUP BY
  ls.operating_company_id,
  ls.origin_city,
  ls.origin_state,
  ls.destination_city,
  ls.destination_state,
  ls.month_start,
  ls.month_end;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lane_metrics_monthly_lane
  ON reports.lane_metrics_monthly(
    operating_company_id,
    origin_city,
    origin_state,
    destination_city,
    destination_state,
    month_start
  );

CREATE OR REPLACE FUNCTION reports.refresh_lane_metrics_monthly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = reports, mdata, public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW reports.lane_metrics_monthly;
END;
$$;

GRANT EXECUTE ON FUNCTION reports.refresh_lane_metrics_monthly() TO ih35_app;

COMMIT;
