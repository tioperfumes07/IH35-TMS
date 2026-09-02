# GO-19 — Thirteen half-built features

**Source:** `~/Downloads/MAP-FINDINGS_1.md` **L28–44**.

Screen + endpoint exist; **table missing**; code skips; operator sees empty / told nothing.

| # | Name | Missing table | Screen | Endpoint |
|---|------|---------------|--------|----------|
| 1 | Plaid items (health skip) | `banking.plaid_items` | health deep | `GET /api/v1/health/deep` |
| 2 | Bank recon drift alerts | `banking.reconciliation_drift_alerts` | Owner Home Today’s Attention | `GET /api/v1/owner/todays-attention` |
| 3 | Late-arrival aggregates | `dispatch.late_arrival_aggregates` | Driver retention features | retention feature-extractor |
| 4 | Fuel recommended stops | `fuel.recommended_stops` | `/fuel/planner` | `GET /api/v1/fuel/planner/*` |
| 5 | Fuel route recommendations | `fuel.route_recommendations` | `/fuel/planner` | planner + fuel-stop-planner |
| 6 | Inventory parts | `inventory.parts` | Work order cost context | wo-cost-context |
| 7 | Maintenance labor rates | `maintenance.labor_rates` | WO detail / catalog | wo-cost-context · useCatalogQuery |
| 8 | Predictive maintenance alerts | `maintenance.predictive_alerts` | Owner Home Attention | todays-attention |
| 9 | Customer health scores | `mdata.customer_health_scores` | Owner Home Attention | todays-attention |
| 10 | QBO connections (wrong name) | `qbo.connections` | health deep | Real table: `integrations.qbo_connections` |
| 11 | Accident liabilities | `safety.accident_liabilities` | Safety Accidents | `POST …/accidents/:id/spawn-liability` (stub null) |
| 12 | Workers’ comp claims | `safety.workers_comp_claims` | Safety home KPIs | safety-home.service |
| 13 | Cargo sensor incidents | `telematics.cargo_sensor_incidents` | Owner Home Attention | todays-attention |
