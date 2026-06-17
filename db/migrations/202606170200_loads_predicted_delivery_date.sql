-- ETA-MODEL (Phase 7, BLOCK 1) — two-date load model: scheduled (baseline) + predicted (live ETA).
--
-- WHY: today a load's delivery date is the SCHEDULED appointment, derived from the first
-- delivery stop (mdata.load_stops: COALESCE(scheduled_arrival_at, appointment_start_at)). The
-- cash forecast and the dispatch board both read that single date. To let late-detection drive
-- the cash FORECAST (BLOCK 2) we add a separate PREDICTED delivery date that floats from signals,
-- while the scheduled appointment stays untouched.
--
-- MODEL:
--   * scheduled_delivery_date  = UNCHANGED, still derived from the delivery stop. We do NOT
--                                duplicate it onto mdata.loads (avoids drift). It only moves when
--                                a load is genuinely rescheduled with the customer (stop edit).
--   * predicted_delivery_date  = live ETA. Nullable. When null, every consumer falls back to the
--                                derived scheduled date via COALESCE(predicted, scheduled) =
--                                effective_delivery_date.
--   * predicted_source         = where the prediction came from (free text in BLOCK 1; the allowed
--                                signal vocabulary is locked by BLOCK 2's confirm/audit path, so we
--                                do NOT pin a CHECK here and force a rework migration later).
--   * predicted_updated_at     = when the prediction last changed.
--
-- These are FORECAST/SCHEDULING columns only. NO foreign keys, NO posting/GL, NO change to
-- accounting.* / AR / invoices. Per-operating_company RLS on mdata.loads is UNCHANGED (adding
-- nullable columns does not alter the existing policy). Idempotent. Self-contained.
-- Reversible: ALTER TABLE mdata.loads DROP COLUMN predicted_delivery_date, predicted_source,
-- predicted_updated_at.
--
-- GRANTs: new columns on an existing table inherit mdata.loads' table-level grants to ih35_app
-- (migration 0065 + DEFAULT PRIVILEGES), so no extra GRANT is required for SELECT/UPDATE.

BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS predicted_delivery_date timestamptz,
  ADD COLUMN IF NOT EXISTS predicted_source text,
  ADD COLUMN IF NOT EXISTS predicted_updated_at timestamptz;

-- Backfill: for OPEN loads (not yet delivered/closed/cancelled), seed predicted = the derived
-- scheduled delivery date so no consumer ever reads NULL on day one. predicted == scheduled means
-- "no slip yet", which is the correct starting state. Closed/terminal loads keep predicted NULL
-- (they read actuals, never a forecast). Idempotent: only fills rows still NULL.
UPDATE mdata.loads l
SET
  predicted_delivery_date = sub.scheduled_delivery_at,
  predicted_source = 'scheduled_backfill',
  predicted_updated_at = now()
FROM (
  SELECT
    s.load_id,
    (
      SELECT COALESCE(ds.scheduled_arrival_at, ds.appointment_start_at)
      FROM mdata.load_stops ds
      WHERE ds.load_id = s.load_id
        AND ds.stop_type::text = 'delivery'
      ORDER BY ds.sequence_number ASC
      LIMIT 1
    ) AS scheduled_delivery_at
  FROM mdata.load_stops s
  GROUP BY s.load_id
) sub
WHERE l.id = sub.load_id
  AND l.predicted_delivery_date IS NULL
  AND sub.scheduled_delivery_at IS NOT NULL
  AND l.status::text NOT IN ('delivered', 'delivered_pending_docs', 'invoiced', 'paid', 'closed', 'completed_docs_received', 'cancelled');

COMMIT;
