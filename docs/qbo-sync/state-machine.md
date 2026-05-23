# QBO Sync State Machine (P5-T3)

## States

- `pending`
- `in_progress`
- `succeeded`
- `failed_retryable`
- `failed_terminal` (dead letter)

## Transition Diagram

```text
pending
  └──> in_progress
          ├──> succeeded
          ├──> failed_retryable ──> in_progress
          └──> failed_terminal

failed_terminal
  └──> pending (manual retry action)
```

Persisted `qbo.sync_runs.status` mapping:

- `pending` -> `pending`
- `in_progress` -> `running`
- `succeeded` -> `success`
- `failed_retryable` -> `failed`
- `failed_terminal` -> `dead_letter`

## Retry Policy

- Maximum attempts: `5` (`MAX_SYNC_ATTEMPTS`)
- Backoff formula: `2^N` minutes after failure attempt `N`
- Backoff cap: `60` minutes
- If `attempt_count >= 5`, transition to terminal failure (`dead_letter`)

## Operational Notes

- Every state mutation is tenant-scoped by both `id` and `operating_company_id`.
- Dead-letter transitions emit critical alerting and notification hooks.
- Event log endpoint can filter terminal failures via:
  - `GET /api/v1/qbo/sync-event-log?state=dead_letter`
