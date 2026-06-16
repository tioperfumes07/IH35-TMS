-- Block F final step: enable the Manual Daily Projections tab (feature flag).
-- The backend /api/v1/forecast/* routes are gated by the CASH_FORECAST_ENABLED env var
-- (set on the Render service). This seeds the frontend feature flag (lib.feature_flags)
-- so useFeatureFlag returns true and the tab renders. The feature is firewalled,
-- non-posting, per-company RLS — safe to enable. Idempotent.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'CASH_FORECAST_ENABLED',
  'Manual Daily Projections — firewalled hand-entered cash forecast tab (non-posting).',
  true,
  100
)
ON CONFLICT (flag_key) DO UPDATE
  SET default_enabled = true, rollout_pct = 100;
