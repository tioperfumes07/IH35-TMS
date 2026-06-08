# GAP-25 — Active Driver Set 15-min Recompute

**Wave:** G-K · **Lane:** B · **Status:** Merged (pending GO-25)

## Problem

Safety home filters to "active drivers in past 7-10 days" by scanning `integrations.samsara_drivers` + webhook events at query time.  At 25 drivers the scan is tolerable; at USMCA scale (40+) it grows to >800ms per request.

## Solution

Pre-compute the active-driver set every 15 minutes per operating company and store it in `integrations.active_driver_set_cache`.  SafetyHome reads the cache (<100ms) instead of scanning at request time.

## Architecture

```
                  ┌─────────────────────────┐
15min cron ──────▶│ active-driver-set-recompute.ts (worker)       │
                  │  recomputeActiveDriverSet(oci, 7|14|30d)      │
                  └────────────┬────────────┘
                               │ INSERT snapshot
                               ▼
                  integrations.active_driver_set_cache
                               │
                               │ SELECT (max_age=15min)
                  ┌────────────┴────────────┐
                  │ query.service.ts         │
                  │  getActiveDrivers(oci)   │──── fallback recompute if stale
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │ routes.ts               │
                  │  GET  /api/…/active-drivers
                  │  POST /api/…/active-drivers/recompute
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │ SafetyHome.tsx          │
                  │  Filter: 7d/14d/30d/All │
                  │  Freshness indicator    │
                  └─────────────────────────┘
```

## Database

### `integrations.active_driver_set_cache`

| Column | Type | Description |
|---|---|---|
| `uuid` | UUID PK | Row identifier |
| `operating_company_id` | UUID NOT NULL | Tenant scope |
| `snapshot_at` | TIMESTAMPTZ | When computed |
| `threshold_days` | INTEGER | Activity window (7/14/30) |
| `active_driver_uuids` | UUID[] | UUIDs of active local drivers |
| `total_driver_count` | INTEGER | All drivers for OCI |

RLS policy: `ih35_app` role, scoped to `app.operating_company_id` setting (lucia bypass for worker).

Retention: 30 snapshots per (OCI, threshold_days) pair — older rows pruned on each write.

## Activity Definition

A driver is considered active if, within `threshold_days`:
- `samsara_drivers.last_seen_at >= cutoff`, OR
- A `samsara_webhook_events` row references the driver's Samsara ID within the window

## API

### `GET /api/integrations/samsara/active-drivers`

Query params:
- `operating_company_id` (UUID, required)
- `threshold_days` (7 | 14 | 30, default 7)
- `max_age_minutes` (default 15)

Response:
```json
{
  "active_driver_uuids": ["..."],
  "total_driver_count": 42,
  "snapshot_at": "2026-06-08T00:01:00Z",
  "threshold_days": 7,
  "cache_hit": true
}
```

### `POST /api/integrations/samsara/active-drivers/recompute`

Body: `{ "operating_company_id": "...", "threshold_days": 7 }`

Triggers immediate recompute. Returns the new snapshot.

## Frontend

`apps/frontend/src/pages/safety/SafetyHome.tsx` (deprecated shell, retained for reference):

- Filter dropdown: **Active 7d** (default) / Active 14d / Active 30d / All drivers
- Freshness indicator: driver count ratio + cache_hit status + snapshot timestamp

## Performance Target

| Metric | Before | After |
|---|---|---|
| SafetyHome driver filter load | >800ms | <100ms |
| Cache freshness | n/a | ≤15min |
| Snapshot retention | n/a | 30 per OCI |

## CI Guard

`scripts/verify-active-driver-set.mjs` — checks migration, services, routes, worker, wiring, and SafetyHome integration.

## Acceptance Criteria

- [x] Migration `202606080001_active_driver_set_cache.sql` applied
- [x] Worker recomputes every 15min for all Samsara-enabled OCIs
- [x] SafetyHome filter dropdown: 7d / 14d / 30d / All
- [x] SafetyHome shows freshness indicator (cache_hit + snapshot_at)
- [x] `verify-active-driver-set.mjs` passes in CI
- [x] Tests: snapshot creation, retention, stale fallback, RLS isolation
- [x] No regression on existing safety filter UI (additive only)
