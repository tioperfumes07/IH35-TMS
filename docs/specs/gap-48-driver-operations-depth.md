# GAP-48 — Driver Operations Depth (12 Sub-Views)

**Classification:** ADDITIVE
**Branch:** `feature/gap-48-driver-operations-depth`
**Lane:** A (paired with GAP-49 Lane B — disjoint paths)

## Problem

`DriverDetail` previously surfaced a shallow set of tabs. Owners and Safety need a
full operational-history surface for a driver in one place. GAP-48 adds a new
**Operations** tab that exposes 12 read-only operational sub-views, each scoped to
the active operating company (RLS) and paged for large drivers.

## Sub-views

| # | Sub-view | Route | Source table |
|---|----------|-------|--------------|
| 1 | Debt history | `GET /api/drivers/:uuid/operations/debt-history` | `driver_finance.driver_advances` |
| 2 | Payroll history | `GET /api/drivers/:uuid/operations/payroll-history` | `payroll.driver_settlements` |
| 3 | Escrow history | `GET /api/drivers/:uuid/operations/escrow-history` | `driver_finance.escrow_ledger` |
| 4 | Permit history | `GET /api/drivers/:uuid/operations/permit-history` | `safety.permits` |
| 5 | Accident history | `GET /api/drivers/:uuid/operations/accident-history` | `safety.accident_reports` |
| 6 | Settlement history | `GET /api/drivers/:uuid/operations/settlement-history` | `driver_finance.driver_settlements` |
| 7 | Fuel history | `GET /api/drivers/:uuid/operations/fuel-history` | `fuel.fuel_transactions` |
| 8 | Maintenance assignments | `GET /api/drivers/:uuid/operations/maintenance-assignments` | `telematics.vehicle_driver_assignments` |
| 9 | Safety events | `GET /api/drivers/:uuid/operations/safety-events` | `safety.harsh_events` |
| 10 | Communications log | `GET /api/drivers/:uuid/operations/communications-log` | `mdata.driver_profile_messages` |
| 11 | PWA engagement | `GET /api/drivers/:uuid/operations/pwa-engagement` | `dispatch.auto_status_suggestion_responses` |
| 12 | Documents vault | `GET /api/drivers/:uuid/operations/documents-vault` | `docs.file_links` |

## Contract

- Every route requires authentication and an `operating_company_id` query parameter.
- `assertDriverScope` confirms the driver belongs to the operating company before any
  data is returned; otherwise `404 driver_not_found`.
- Each loader returns a paged envelope: `{ sub_view, rows, page, page_size, total, has_more }`.
- `page` (default 1) and `page_size` (default 25, max 200) control the LIMIT/OFFSET window.
- Read-only: no write/delete routes are added. ADDITIVE only — no existing tab removed.

## Frontend

- `DriverDetail.tsx` gains an **Operations** tab (after QBO Mapping).
- `OperationsDepthNav` is a hover-dropdown secondary nav (G3 pattern) grouping the 12
  sub-views into Financial / Compliance & Safety / Operations / Engagement.
- `OperationsHistoryTable` is the shared paged table used by all 12 sub-view pages under
  `apps/frontend/src/pages/drivers/operations/`.

## CI guard

`scripts/verify-driver-operations-depth.mjs` (wired as `verify:driver-operations-depth`
in `package.json` and `.github/workflows/ci.yml`) asserts: all 12 services exist, all 12
routes are registered, all 12 page files exist, `OperationsDepthNav` lists all 12, the
routes are wired in `apps/backend/src/index.ts`, and the Operations tab is mounted.

## Acceptance

- [x] All 12 services return correct paged, RLS-scoped data.
- [x] All 12 sub-views render under the driver Operations tab.
- [x] Hover-dropdown nav lists all 12 sub-views.
- [x] Operations tab added to DriverDetail (additive, no tab removed).
- [x] `verify:driver-operations-depth` in the CI chain.
