# GAP-34 — Driver PWA Dispatch View (G22)

**Block:** GAP-34 · **Wave:** G-P · **Lane:** A  
**Paired with:** GAP-35 (true-status timeline, Lane B)

## Problem

Drivers need a consolidated pickup/delivery screen with structured stop details, arrival/departure actions, and per-stop document upload tied to the R2 evidence chain (GAP-11 pattern).

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dispatch/driver-pwa/load/:uuid/dispatch-view` | Structured stops + contacts + doc requirements |
| POST | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival` | Mark stop arrival (driver-owned load only) |
| POST | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure` | Mark stop departure |
| POST | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document` | Attach `evidence_uuid` + `doc_type` to stop |

## PWA

- Screen: `apps/driver-pwa/src/screens/DispatchView.tsx`
- Route: `/dispatch/:load_uuid`
- Components: `PickupCard`, `DeliveryCard`, `DocUploadDrawer`
- Client: `apps/driver-pwa/src/lib/dispatch-api-client.ts`

## RLS

All routes require driver session; load access limited to `assigned_primary_driver_id` / `assigned_secondary_driver_id`.

## CI

`npm run verify:driver-pwa-dispatch-view`

## Related

- GAP-11 universal upload widget (evidence_create)
- GAP-35 consumes stop-action data for true-status timeline
