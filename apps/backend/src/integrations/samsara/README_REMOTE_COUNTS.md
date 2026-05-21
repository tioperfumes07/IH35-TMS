# Samsara Remote Count Helper (DS-REMEDIATE-9)

This module records remote driver and vehicle counts from Samsara so reconciliation can compare local mirrors against remote state without performing request-path API reads.

## Components

- Collector: `remote-count-collector.ts`
- Cron entry: `apps/backend/src/cron/samsara-remote-count-collector.cron.ts`
- Storage table: `integrations.samsara_remote_counts`
- Collector state table: `integrations.samsara_remote_count_collection_state`

## Cadence

- Runs every 12 hours (`America/Chicago`) to match `reconciliation.samsara_static`.

## Counting strategy (v1)

- Uses paginated list endpoints with `limit=512`:
  - `GET /fleet/drivers`
  - `GET /fleet/vehicles`
- Counts are computed by traversing pages and summing returned rows.
- This is linear in page count. At current fleet scale this is typically one page per entity.

## Failure handling

- `401/403`: emits `samsara_auth_failed` and collector state records `auth_failed`.
- `429`: emits `samsara_api_rate_limit_hit`.
- Other failures: emits `samsara_remote_count_failed`.
- Failures for one entity do not block collection for the other entity.

## Reconciliation interaction

`reconciliation-worker.service.ts` consumes the latest stored counts and:

- emits `remote_unavailable` only if count is missing/stale, and
- emits `count_drift` when delta is non-zero and race-window guard conditions are not active.

Race-window guard:

- before drift comparison, the worker checks latest matching webhook event timestamp
  (`driver.%` or `vehicle.%`);
- if webhook recency is beyond `polled_at + 2 minutes`, the drift check is skipped for that tick and
  `cron_count_drift_check_skipped_pending_projection` is audited.
