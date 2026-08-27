-- CASH-FLOW-ACTUAL-VS-PROJECTED-INCOME-STRUCTURALLY-ALWAYS-ZERO
--
-- getActualVsProjected()'s "projected income" for a PAST date is recomputed LIVE at request time
-- from the load's/invoice's CURRENT state. Once a load is delivered, invoiced, and the invoice
-- progresses past 'proforma' (sent/paid) -- exactly what real revenue does -- that load
-- permanently stops satisfying either branch of the projection query, RETROACTIVELY, for the
-- exact day it was delivered. Every historical day with real completed revenue therefore shows
-- Projected Income = $0.00 forever, manufacturing a permanent ~100% "variance" that measures
-- nothing about prediction accuracy.
--
-- Fix: a daily, append-only snapshot of what getDailyPrediction() said a date's income would be,
-- captured each morning before that day's loads have had a chance to complete their lifecycle.
-- getActualVsProjected() reads this snapshot for any date strictly before "today" (company
-- business date); today itself stays live (its own prediction is still evolving). A date with no
-- snapshot row (pre-fix history, or a missed cron day) falls back to the existing live query --
-- never worse than today's behavior, only better once a snapshot exists.
--
-- No FK into accounting/mdata/banking (display/read snapshot only, mirrors forecast.cash_entries'
-- own no-FK convention). FORCE RLS with the canonical lucia-bypass escape (the daily cron writes
-- via withLuciaBypass -- a background job has no live per-request operating_company_id GUC).
-- Append-only: forecast's schema-level ALTER DEFAULT PRIVILEGES (202606161800) auto-grants
-- UPDATE/DELETE to ih35_app on every new table in this schema, so a bare narrow GRANT is not
-- enough here -- an explicit REVOKE is required to actually enforce append-only.

CREATE TABLE IF NOT EXISTS forecast.cash_flow_projection_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  prediction_date date NOT NULL,
  projected_income_cents bigint NOT NULL,
  cash_follows_eta boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cash_flow_projection_snapshots_company_date UNIQUE (operating_company_id, prediction_date)
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_projection_snapshots_company_date
  ON forecast.cash_flow_projection_snapshots (operating_company_id, prediction_date);

ALTER TABLE forecast.cash_flow_projection_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast.cash_flow_projection_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_flow_projection_snapshots_rls ON forecast.cash_flow_projection_snapshots;
CREATE POLICY cash_flow_projection_snapshots_rls ON forecast.cash_flow_projection_snapshots
  FOR ALL
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA forecast TO ih35_app;
GRANT SELECT, INSERT ON forecast.cash_flow_projection_snapshots TO ih35_app;
-- forecast's own ALTER DEFAULT PRIVILEGES (202606161800) auto-grants UPDATE/DELETE to ih35_app on
-- every new table in this schema; explicitly revoke them so this frozen-snapshot table is truly
-- append-only (never UPDATE, never DELETE -- a snapshot that could change after capture is not a
-- snapshot).
REVOKE UPDATE, DELETE ON forecast.cash_flow_projection_snapshots FROM ih35_app;
