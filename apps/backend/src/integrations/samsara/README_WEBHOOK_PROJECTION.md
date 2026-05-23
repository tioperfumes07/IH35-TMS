# Samsara Webhook Projection Worker (DS-REMEDIATE-7)

This worker consumes immutable rows from `integrations.samsara_webhook_events` and projects them into local mirrors.
Projection lifecycle is tracked in `integrations.samsara_webhook_projection_state`.

## Supported event types (v1)

| Pattern of `event_type` | Target mirror | Notes |
|---|---|---|
| `driver.*` | `integrations.samsara_drivers` | UPSERT on `(operating_company_id, samsara_driver_id)` |
| `vehicle.*` | `integrations.samsara_vehicles` | UPSERT on `(operating_company_id, samsara_vehicle_id)` + downstream geofence/arrival detectors + maintenance predictor when GPS/odometer are present |
| `*driver_log_on*`, `*driver_log_off*`, `*vehicle_assigned*`, `*vehicle_unassigned*` | `telematics.vehicle_driver_assignments` | Close/open assignment windows by unit at event timestamp |
| `*hos*`, `*eld*`, `*duty_status*` | `hos.duty_status_events` | Append-only INSERT, mapped to local `driver_id` / `unit_id` |
| `*gps*`, `*location*`, `*position*` | `integrations.samsara_vehicles` + `geo.geofence_events` | vehicle mirror UPSERT + geofence transition detection when local unit mapping exists |
| `*harsh*`, `*speeding*`, `*distracted*`, `*mobile_use*`, `*seatbelt*` | `telematics.dashcam_clips` | If webhook includes clip IDs, auto-links clips to `safety.harsh_events` via Samsara clip URL lookup |
| `*` | (none) | Dead-letter with `mirror_table_missing` |

Unsupported/unknown values (`""`, `unknown`) dead-letter with `unsupported_event_type`.
Invalid signatures dead-letter with `signature_invalid`.

## Projection-state model

- Raw webhook table remains append-only.
- Sidecar table stores status, attempts, retry timing, and error classification.
- `samsara_event_id` is copied into sidecar rows for correlation during incident analysis.

## Retry behavior

- Batch size default: `100` (`SAMSARA_PROJECTION_BATCH_SIZE` override).
- Transient failures retry with linear backoff:
  - `next_retry_at = now + (attempts * 5 minutes)`
- `MAX_RETRIES = 5` then status becomes `permanently_failed`.

## Add support for a new event type

1. Add or confirm target mirror table (separate schema block if needed).
2. Add a projector under `webhook-projectors/`.
3. Register routing in `webhook-projection.service.ts`.
4. Add projector tests (success + idempotency + malformed payload).
5. Update this README table.
