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
