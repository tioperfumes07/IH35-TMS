# GAP-39 — Geofence State Machine (G17 / Blueprint §3.16)

Formal geofence state transitions: `idle → approaching → at → dwelling → departing → departed`.

## Schema

- `geo.geofence_state_transitions` — append-only transition log
- `geo.geofences.current_state` — materialized current state per geofence

## API

- `GET /api/v1/integrations/samsara/geofences/:uuid/state`
- `GET /api/v1/integrations/samsara/geofences/:uuid/transitions`
- `POST /api/v1/integrations/samsara/geofences/:uuid/manual-transition` (Owner-only)

## Worker

`geofence-state-watcher` runs every 5 minutes, processing latest GPS positions.

## Links

- GAP-26 border geofences
- GAP-27 reconciliation
- GAP-54 250-ft arrival prompt
- CAP-2 auto-geofence on dispatch

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/backend/src/integrations/samsara/geofences/state-machine/routes.ts
  - apps/frontend/src/pages/reports/GeofenceDwellReport.tsx
