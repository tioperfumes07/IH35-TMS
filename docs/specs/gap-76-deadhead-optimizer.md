# GAP-76 — Deadhead mile optimizer

## Problem

After delivery, dispatchers often assign the next load without comparing deadhead distance to open freight. Empty miles erode margin.

## Solution

Rank open (`assigned_not_dispatched`) loads for a truck using haversine distance from the drop location to each candidate pickup. No external distance matrix APIs.

### Score

`score = (revenue_cents - deadhead_cost_cents) / total_miles`

- `deadhead_cost_cents = deadhead_miles × default_deadhead_rate_per_mile_cents` (250¢ default)
- `total_miles = deadhead_miles + loaded_miles`
- `loaded_miles` prefers `miles_practical`, then `miles_shortest`, else haversine pickup→delivery

### API

`GET /api/v1/dispatch/deadhead/next-load-suggestions`

Query:

- `operating_company_id` (uuid, required)
- `unit` (uuid, required)
- `after` (ISO datetime, required) — only loads with first pickup at/after this time
- `max_deadhead_miles` (optional, default 200)
- `drop_city`, `drop_state` (optional book-load preview)
- `drop_latitude`, `drop_longitude` (optional explicit drop)

Response: `{ suggestions: NextLoadSuggestion[] }` (top 5).

### UI

`DeadheadOptimizerPanel` shows the top 5 suggestions. `BookLoadModalV4` renders the panel when a truck unit is selected, using the last delivery stop window for `after` and city/state preview for drop origin.

### CI

`npm run verify:deadhead-optimizer`

## Lane lock

Does not touch lane-profitability paths (`apps/backend/src/dispatch/analytics/lane-profitability/**`, `LaneProfitabilityHeatmap.tsx`).
