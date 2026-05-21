# QBO Remote Count Collector (DS-REMEDIATE-2)

The QBO remote-count collector runs in the Sync/Ingest layer only. It never runs in request-path routes.

- Collector module: `remote-count-collector.ts`
- Scheduler: `apps/backend/src/cron/qbo-remote-count-collector.cron.ts`
- Storage table: `accounting.qbo_remote_counts` (canonical schema in migration `0201`)
- Failure state table: `accounting.qbo_remote_count_collection_state`

Default cadence:

- Delta run: every 6 hours
- Full run: daily at 02:20 America/Chicago

Collected v1 entity types:

- `qbo_accounts`
- `qbo_classes`
- `qbo_items`
- `qbo_customers`
- `qbo_vendors`

Outage behavior:

- First failure emits `qbo.outage_started`
- Failures continue without crashing the scheduler tick
- Third consecutive failure emits `qbo.outage_escalated`
- Recovery emits `qbo.outage_recovered` and resets failure streak
