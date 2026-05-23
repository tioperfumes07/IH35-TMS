# CAP-11-DASHCAM Integration

## Design

- Stores Samsara-hosted clip URL + metadata only (`telematics.dashcam_clips`), no blob storage in TMS.
- Auto-link path: webhook projector checks harsh-event payload entries for clip IDs and links clips to matching `safety.harsh_events` records.
- On-demand path: restricted endpoint requests a clip from Samsara for a unit/time window and persists resulting metadata.

## RBAC

- Dashcam endpoints are restricted to:
  - `owner`
  - `administrator`
  - `safety_lead`

## Guardrails

- `scripts/verify-dashcam-clips-tenant-scope.mjs`
- `scripts/verify-dashcam-rbac-restrict.mjs`
