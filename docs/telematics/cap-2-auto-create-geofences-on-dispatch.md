# CAP-2 Auto-Create Geofences On Dispatch

## Scope

- On successful load booking, trigger a non-blocking auto-geofence routine.
- For each load stop:
  - use stop/location coordinates when available,
  - skip geofence creation if an active customer-site geofence already exists,
  - create a default 100m square geofence (`vertices_json`) when missing.

## Design Choices

- Hook is asynchronous from the dispatch booking route (`void ...catch(...)`) so request latency is unaffected.
- Geocoding fallback is intentionally non-blocking in this cut; missing coordinates are audit-logged and skipped.
- Auto-created geofences are marked with `source='auto_dispatch'`.

## Guardrails

- `verify-auto-geofence-tenant-scope.mjs`
- `verify-auto-geofence-no-blocking-call.mjs`
