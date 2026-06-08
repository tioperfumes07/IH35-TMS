# GAP-59 — CAP-9 Vehicle-Driver Pairing At Time of Event

**Source:** CAP-9 Samsara capabilities · driver-card swipe / login pairing for WO, accident, fuel, and damage attribution  
**Block:** GAP-59 (Wave P2-E, Lane A)

## Problem

Drivers are not permanently assigned to trucks. When a work order, accident, fuel transaction, or damage report occurs, the system must answer **who was driving which truck at that exact moment**. Samsara exposes this via driver-vehicle assignment events; IH35 must persist and query it per tenant.

## Solution (additive — wraps existing telematics table)

Migration `0221` already created `telematics.vehicle_driver_assignments`. GAP-59 adds:

1. **Audit migration** (`202606080217_vehicle_driver_pairing_audit.sql`) — `samsara_assignment_id` on assignments + `telematics.vehicle_driver_pairing_overlap_flags` with `ih35_app` RLS.
2. **Pairing service** (`pairing.service.ts`) — `syncFromSamsara()`, `lookupDriverForVehicleAtTime()`, overlap detection, manual override.
3. **Routes** (`routes.ts`) — spec paths under `/api/integrations/samsara/pairing/*` alongside existing `/api/v1/telematics/vehicle-driver-*` routes.
4. **Shared helper** (`at-time-of-event-lookup.ts`) — `lookupDriverForVehicleAtTime(client, { operating_company_id, vehicle_id, at_time })`.
5. **Worker** (`vehicle-driver-pairing-worker.ts`) — hourly cron sync from Samsara `/fleet/vehicles/driver-assignments`; stops if overlap ratio exceeds 5%.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/integrations/samsara/pairing/at-event` | Lookup driver at `vehicle_id` + `at_time` |
| GET | `/api/integrations/samsara/pairing/driver-history` | Driver assignment history in `[from, to]` |
| POST | `/api/integrations/samsara/pairing/manual-override` | Owner/Safety manual pairing (audited) |

Query/body always includes `operating_company_id` for tenant scope.

## Data model

- **Primary store:** `telematics.vehicle_driver_assignments` (append-only intervals; `source` ∈ `samsara_webhook`, `manual_override`, `reconciled`).
- **Sync key:** `samsara_assignment_id` = `{vehicleId}:{driverId}:{startTime}`.
- **Overlap flags:** rows where one driver has concurrent assignments on different units.

## Consumers

Post-merge, WO creation, accident ingestion, fuel matching, and damage reports should migrate to `at-time-of-event-lookup.ts`. Existing modules already query pairing data:

- Maintenance: `dtc-auto-work-order.service.ts`
- Safety: `harsh-events-ingestion.service.ts`
- Fuel: `fraud-detector/rules.service.ts`

## CI

`verify:cap-9-pairing` — structural guard for migration, service, routes, worker, shared helper, and wiring in `index.ts`.
