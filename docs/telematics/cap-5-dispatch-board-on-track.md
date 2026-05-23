# CAP-5 Dispatch Board On-Track Status

## Scope

- Adds a read-only derived progress signal per load: `early`, `on_track`, `behind`, `delayed`, `unknown`.
- Computes status at read-time in `load-progress.service.ts` from:
  - current unit GPS (Samsara mirrored payload),
  - next not-yet-departed stop on the load,
  - scheduled stop arrival timestamp.
- No schema changes and no write paths in the progress service.

## Rules

- ETA uses haversine miles and default highway speed `60 mph`.
- Delta formula: `eta_at - scheduled_arrival_at` (minutes).
- Bands:
  - `< -30`: `early`
  - `<= 15`: `on_track`
  - `<= 60`: `behind`
  - `> 60`: `delayed`
  - missing GPS/stop schedule/stop coordinates: `unknown`

## API + UI wiring

- `GET /api/v1/mdata/loads` accepts `include_progress=true`.
- Dispatch page opts in via `useLoadsList({ include_progress: true })`.
- Progress pill rendered in both:
  - Kanban card (`components/dispatch/LoadCard.tsx`)
  - List row/mobile card (`components/dispatch/DispatchList.tsx`)
