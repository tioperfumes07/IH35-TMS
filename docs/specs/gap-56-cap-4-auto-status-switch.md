# GAP-56 / CAP-4 — Auto Status Switching on Vehicle Movement

## Summary

When live Samsara GPS diverges from driver-reported load status, the system proposes or applies corrections and notifies the driver.

## Detection cases

| Case | Condition | Action |
|------|-----------|--------|
| A | GPS moved >5 mi in 30 min and status=`at_pickup` | Auto-apply `in_transit`, notify driver |
| B | GPS stationary >30 min at pickup geofence and status=`in_transit` | Flag `dispatch.intransit_issues` (no auto-revert) |
| C | GPS at delivery geofence >5 min and status=`in_transit` | Auto-apply `at_delivery`, notify driver |

## Data sources

- GPS: `integrations.samsara_vehicle_positions` (GAP-55)
- Load status: `mdata.loads.status`
- Movement history: `integrations.auto_status_position_snapshots` (5 min worker snapshots)
- Audit trail: `integrations.auto_status_switch_events` with `auto_switched=true` on applied switches

## API

- `POST /api/integrations/samsara/auto-status-switch/detect/:load_uuid`
- `POST /api/integrations/samsara/auto-status-switch/apply`
- `GET /api/integrations/samsara/auto-status-switch/recent`

## Worker

`auto-status-switch-worker.ts` runs every 5 minutes (America/Chicago), scans active loads, records position snapshots, auto-applies A/C, and flags B.

## UI

- Dispatch: `AutoStatusSwitchedBadge` — hover tooltip with auto-switch reason
- Driver PWA: `AutoStatusNotice` — confirm/dispute banner after auto-switch

## CI

`npm run verify:cap-4-auto-status-switch`
