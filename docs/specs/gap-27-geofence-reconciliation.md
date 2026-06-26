# GAP-27: Daily Geofence Reconciliation Report

## Purpose
Daily audit of geo.geofence_events to detect integrity anomalies: orphan entries, orphan exits, duplicate fires, and expected-but-missing events.

## Tables
- `safety.integrity_findings` — persisted anomaly findings with resolve workflow

## Services
- `reconciliation.service.ts` — detects 4 anomaly classes, persists findings

## API
- `GET /api/v1/integrations/samsara/geofences/reconciliation?date=` — list findings
- `GET /api/v1/integrations/samsara/geofences/reconciliation/anomaly/:uuid` — single finding
- `PATCH /api/v1/integrations/samsara/geofences/reconciliation/anomaly/:uuid/resolve` — resolve

## Worker
- `geofence-reconciliation-daily` — runs at 02:00 CT, processes all active companies

## Frontend
- `/reports/geofence-reconciliation` — daily report with resolve workflow

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx
  - apps/backend/src/integrations/samsara/geofences/reconciliation.routes.ts
