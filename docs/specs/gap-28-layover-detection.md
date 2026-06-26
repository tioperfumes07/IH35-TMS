# GAP-28: Layover Time Computation (>8h Gap)

## Purpose
Detect driver layovers (>8h gap between load delivery and next assignment) automatically.
Provides billable flag for customer billing and per-diem eligibility tracking.

## Tables
- `dispatch.driver_layovers` — detected layovers with duration, billable + per-diem flags

## Services
- `detection.service.ts` — scans consecutive driver loads, detects gaps >8h

## API
- `GET /api/v1/dispatch/layovers?driver=&from=&to=` — list driver layovers
- `PATCH /api/v1/dispatch/layovers/:uuid/mark-billable` — Manager+ only
- `PATCH /api/v1/dispatch/layovers/:uuid/per-diem-exclude` — Owner only

## Workers
- `layover-detector-worker` — runs every 6h

## Frontend
- `DriverLayoverHistory.tsx` — per-driver layover list
- `DriverProfilePage.tsx` — layover summary card added

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx
