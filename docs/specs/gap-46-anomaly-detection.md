# GAP-46 — Integrity Anomaly Detection Alert Engine

Non-financial operational/integrity anomaly detection (§4 Unified Additions).

## Default rules (6)
1. `duplicate_load_number` — integrity / high
2. `fuel_off_route_geo` — operational / warn
3. `dvir_major_open_unit` — security / critical (WF-050)
4. `inactive_driver_assignment` — integrity / critical (WF-038)
5. `geofence_duplicate_fire` — integrity / warn
6. `pm_due_advisory` — operational / info (WF-044)

## Routes
- `GET /api/safety/anomaly/rules`
- `POST /api/safety/anomaly/rules` (Owner)
- `GET /api/safety/anomaly/alerts`
- `PATCH .../acknowledge`, `PATCH .../resolve`

## Add rule
Insert via RuleEditor (Owner) or POST with `detector_function` matching registry key.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx
