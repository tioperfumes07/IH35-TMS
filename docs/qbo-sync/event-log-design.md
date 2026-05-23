# QBO Sync Event Log Design

## Page Wireframe (text mockup)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ QBO Sync Event Log                                                  │
│ Read-only tenant-scoped observability across runs/alerts/outbox     │
├──────────────────────────────────────────────────────────────────────┤
│ Filter by kind: [All kinds] [Runs] [Alerts] [Outbox]                │
│ Filter by severity: [All severities] [Info] [Warn] [Error]          │
├──────────────────────────────────────────────────────────────────────┤
│ Timestamp            Kind    Severity   Summary                      │
│ 2026-05-23 11:22:10  run     info       sync run customer success    │
│ 2026-05-23 11:21:41  outbox  error      outbox qbo.sync.failed failed│
│ 2026-05-23 11:20:02  alert   warn       token near expiry            │
│   ↳ expand row: pretty-printed JSON detail payload                   │
├──────────────────────────────────────────────────────────────────────┤
│ Load more                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

## Backend Query Plan

`GET /api/v1/qbo/sync-event-log` composes a merged stream from:

1. `qbo.sync_runs` (tenant filter: `operating_company_id = :tenant`)
2. `qbo.sync_alerts` (tenant filter: `operating_company_id = :tenant`)
3. `outbox.events` where:
   - `event_type LIKE 'qbo.%'`
   - terminal state (`failed_at IS NOT NULL OR delivered_at IS NOT NULL`)
   - tenant filter via payload (`payload->>'operating_company_id' = :tenant`)

Each source is normalized to:
- `id`
- `kind` (`run` | `alert` | `outbox`)
- `occurred_at`
- `severity` (`info` | `warn` | `error`)
- `summary`
- `detail` (json object)
- `cursor_id` (stable tie-break key)

The stream is merged with `UNION ALL` and sorted by `occurred_at DESC, cursor_id DESC`.

## Pagination Strategy

- Cursor payload: base64url JSON of `{ occurred_at, cursor_id }`
- Keyset pagination predicate:
  - `(occurred_at, cursor_id) < (:cursor_occurred_at, :cursor_id)`
- No `OFFSET` is used (prevents scan amplification and unstable pages during writes)
- Limit is capped (`max 200`, default `50`)

## Notes

- Read-only observability surface; no sync job mutation logic.
- Linked from Office HOME QBO sync health card route (`/qbo/sync-dashboard`).
