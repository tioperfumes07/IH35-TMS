-- LOADS-MILEAGE-INTEGER-TRUNCATION (board row, Codex 2026-08-30, REV-E row 014).
--
-- mdata.loads.loaded_miles/miles_practical/miles_shortest/miles_deadhead are all `integer` while
-- AlwaysTrack (the source system) carries tenths of a mile (e.g. 1595.7). Both write paths
-- (apps/backend/src/dispatch/loads.routes.ts create/edit schemas) currently declare
-- `z.number().int().min(0)`, so a decimal value 400s at the API boundary rather than being
-- silently truncated -- CC-1's own earlier blast-radius measurement (docs/audit/GUARD-WORKORDERS.md,
-- LOADS-MILEAGE-INTEGER-TRUNCATION BLAST-RADIUS REPORT) confirmed this is a forced-round UX gap,
-- not silent truncation, bounded to <=~$40 lifetime across the 70 live loads that existed at that
-- measurement. Regardless of materiality to date, driver pay is rate x miles
-- (driver_pay_rate_per_mile is numeric(12,4)) and the column simply cannot hold the source
-- precision today -- this migration removes that ceiling going forward.
--
-- SCOPE -- schema widen only, no backfill
-- numeric(10,1) can represent every existing integer value exactly (a widen is always lossless);
-- this migration touches no data. Backfilling the DECIMAL precision that was already lost on rows
-- entered before this migration is NOT attempted here -- the original source decimal is gone
-- (unrecoverable without re-importing from AlwaysTrack) and any such backfill needs an explicit
-- owner decision per the board row's own instruction ("Owner DECISION required for any backfill of
-- rows already stored at integer precision; do not bundle backfill with the schema fix").
--
-- `deadhead_miles_to_pickup` (a 5th integer mileage column on this table) is deliberately NOT
-- touched here -- grepped every apps/backend/src writer and found none; it appears to be
-- read-only/unpopulated from application code today, outside this finding's named scope
-- (loaded_miles/miles_practical/miles_shortest/miles_deadhead) and outside what was measured live.
--
-- numeric(10,1) chosen to match the board row's own instruction exactly ("Separate migration to
-- numeric(10,1)"); 10 total digits comfortably exceeds any real trucking-route mileage.
--
-- DEPENDENT MATERIALIZED VIEW -- reports.lane_metrics_monthly (migration 0311) reads all 4 of
-- these columns and blocks a plain ALTER COLUMN TYPE ("cannot alter type of a column used by a
-- view or rule") -- live-confirmed via pg_depend before writing this migration. It is dropped and
-- recreated verbatim (identical SELECT + its unique index, byte-for-byte from 0311) around the
-- ALTER so the view keeps working unchanged -- its own COALESCE(...)::bigint casts already convert
-- the widened numeric(10,1) values back to bigint at read time, so this migration changes no
-- downstream MV output shape, only the source precision it can now draw from. No other
-- view/rule/function depends on these 4 columns (pg_depend swept clean before writing this).
-- reports.refresh_lane_metrics_monthly() (SECURITY DEFINER, unchanged) is unaffected -- it
-- references the MV by name, not by column, so it needs no redefinition.

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS reports.lane_metrics_monthly;

ALTER TABLE mdata.loads
  ALTER COLUMN loaded_miles TYPE numeric(10,1) USING loaded_miles::numeric(10,1),
  ALTER COLUMN miles_practical TYPE numeric(10,1) USING miles_practical::numeric(10,1),
  ALTER COLUMN miles_shortest TYPE numeric(10,1) USING miles_shortest::numeric(10,1),
  ALTER COLUMN miles_deadhead TYPE numeric(10,1) USING miles_deadhead::numeric(10,1);

-- Verbatim from 0311_lane_profitability_heatmap.sql (the view's original definition) --
-- recreated unchanged after the widen so its output shape is identical to before.
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

COMMIT;
