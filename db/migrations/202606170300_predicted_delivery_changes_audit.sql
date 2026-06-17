-- PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2) — append-only, per-entity audit of CONFIRMED
-- predicted_delivery_date changes.
--
-- Every dispatcher-confirmed ETA slip writes exactly one row here: who confirmed it, the old/new
-- predicted delivery date, and which signal(s) proposed it. This is the institutional-memory trail
-- the cash FORECAST re-bucketing depends on (McLeod/NetSuite trust bar).
--
-- BOUNDARY: forecast/scheduling audit ONLY. NO posting, NO GL, NO accounting.* / AR / QBO. The
-- feature that writes these rows is gated OFF (lib.feature_flags 'CASH_FOLLOWS_ETA_ENABLED', which
-- reads false when unregistered) until GUARD prod-verify.
--
-- APPEND-ONLY: rows are never updated or deleted — SELECT + INSERT only; UPDATE/DELETE revoked from
-- ih35_app (the forecast-schema DEFAULT PRIVILEGES would otherwise grant all four). Per-entity RLS
-- mirrors forecast.cash_entries (TRANSP/TRK/USMCA never commingle). Idempotent. Self-contained.
-- Reversible: DROP TABLE forecast.predicted_delivery_changes.

BEGIN;

CREATE SCHEMA IF NOT EXISTS forecast;

CREATE TABLE IF NOT EXISTS forecast.predicted_delivery_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  load_id uuid NOT NULL,
  old_predicted_date timestamptz,
  new_predicted_date timestamptz NOT NULL,
  triggering_signals text[] NOT NULL DEFAULT '{}',
  confirmed_by_user_id uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predicted_delivery_changes_company_load
  ON forecast.predicted_delivery_changes (operating_company_id, load_id, confirmed_at DESC);

-- Per-operating_company RLS (same shape as forecast.cash_entries).
ALTER TABLE forecast.predicted_delivery_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS predicted_delivery_changes_rls ON forecast.predicted_delivery_changes;
CREATE POLICY predicted_delivery_changes_rls ON forecast.predicted_delivery_changes
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Append-only grants: keep SELECT + INSERT, strip UPDATE + DELETE that the schema DEFAULT
-- PRIVILEGES would otherwise hand to ih35_app.
GRANT SELECT, INSERT ON forecast.predicted_delivery_changes TO ih35_app;
REVOKE UPDATE, DELETE ON forecast.predicted_delivery_changes FROM ih35_app;

COMMIT;
