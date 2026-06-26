# GAP-71 — Driver Retention Predictive Model

Weekly retention risk scoring for drivers using miles trend, late arrivals, and graceful-degraded feature sources.

## API
- `GET /api/v1/drivers/retention-scores?tier=at_risk`
- `GET /api/v1/drivers/:uuid/retention-score`
- `GET /api/v1/drivers/retention-scores/trend?period_weeks=12`

## CI
`npm run verify:driver-retention`

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - scripts/verify-driver-retention.mjs
  - apps/frontend/src/pages/drivers/RetentionDashboard.tsx
