# GAP-62: CAP-12 Tire Tread Wear Tracking

**Status:** Shipped  
**Wave:** P2-F · Lane B  
**Regulation:** DOT minimum tread — 4/32" steer, 2/32" drive/trailer (49 CFR §393.75)

---

## Problem Statement

Tread depth was captured in DVIR and the B32 tire program but not centralized for wear-rate
analysis. Fleets lacked projected replacement dates, causing surprise tire failures on the road.

---

## Architecture

### Schema: `maintenance.tire_tread_measurements` + `maintenance.tire_projections`

| Table | Purpose |
|---|---|
| `maintenance.tire_tread_measurements` | Append-only tread depth readings by unit/position |
| `maintenance.tire_projections` | Daily-computed replacement date per unit/position |

Measurement sources: `dvir_inspection`, `maintenance_pm`, `tire_service`, `samsara_smart_sensor`.

### Backend: `apps/backend/src/integrations/samsara/cap-12-tire-tread/`

| File | Role |
|---|---|
| `measurement.service.ts` | `recordMeasurement`, `getLatestForUnit`, DOT threshold helper |
| `projection.service.ts` | Linear regression + odometer fallback; `listAtRiskUnits` |
| `routes.ts` | REST at `/api/v1/maintenance/tire-tread/*` |

**Routes:**

```
POST /api/v1/maintenance/tire-tread/measurements
GET  /api/v1/maintenance/tire-tread/measurements?unit=&position=
GET  /api/v1/maintenance/tire-tread/projections?unit=
GET  /api/v1/maintenance/tire-tread/at-risk?within_days=30&axle_group=
```

### Worker: `cap-12-tire-tread-worker.ts`

Daily cron `0 5 * * *` (America/Chicago). Recomputes projections for all active units and
upserts into `maintenance.tire_projections`.

### Frontend

| Component | Route / mount |
|---|---|
| `TireWearDashboard.tsx` | `/maintenance/tires/wear` — at-risk list with axle filter |
| `TireWearProjectionChart.tsx` | Per-position tread trend + DOT threshold line |
| `UnitTiresTab.tsx` | Unit detail → Tires tab wear chart |

---

## DOT Thresholds

- **Steer axles:** 4/32" minimum (49 CFR §393.75)
- **Drive / trailer:** 2/32" minimum

Projection uses linear regression on historical measurements; odometer-based wear rate is
used when regression slope is non-negative.

---

## CI Guard

`npm run verify:cap-12-tire-tread` — migration, worker, routes, dashboard, unit tab, manifest.

---

## Downstream

Feeds GAP-17 Arriving Soon queue (tire alerts) and maintenance planning.
