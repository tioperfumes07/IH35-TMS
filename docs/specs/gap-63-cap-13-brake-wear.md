# GAP-63 — CAP-13 Brake Wear Predictive Maintenance

**Block:** GAP-63 · **Capability:** CAP-13 (Samsara) · **Wave:** P2-G

## Problem

Brake pad/lining wear is measured only at PM intervals (sparse data). Predictive replacement projections are not surfaced, and preventable brake CSA violations occur without proactive tracking.

## Solution

Additive brake lining measurement store + linear-regression replacement projections, daily worker, fleet at-risk dashboard, and per-unit Brakes tab.

## DOT brake thresholds

Per **49 CFR §393.47** (brake lining / pad thickness):

| Axle group | Minimum lining | Positions |
|------------|----------------|-----------|
| **Steer** | **6.4 mm** (1/4 inch) | `LF-S`, `RF-S` |
| **Drive / other** | **3.2 mm** (1/8 inch) | `LR1-D`, `RR1-D`, `LR2-D`, `RR2-D`, … |

Below these limits the vehicle is out of service for brake adjustment / lining replacement.

## Data model

- `maintenance.brake_wear_measurements` — append-only lining readings
- `maintenance.brake_projections` — worker-computed replacement dates (upserted daily)

**Sources:** `dvir`, `pm_inspection`, `brake_service`, `samsara_diagnostics`

> **Samsara limitation:** Not all Samsara diagnostic streams report lining thickness. When `samsara_diagnostics` payload lacks thickness, fall back to PM / DVIR / brake service manual entry only.

## API routes

Base: `/api/v1/maintenance/brake-wear`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/measurements` | Record lining thickness |
| `GET` | `/measurements?unit=&scope=latest\|history` | Latest per position or full history |
| `GET` | `/projections?unit=` | Stored / computed projections |
| `GET` | `/at-risk?within_days=30` | Fleet positions due within window |

## Worker

`cap-13-brake-wear-worker.ts` — daily at 05:00 America/Chicago. Computes projections for all active units and upserts `maintenance.brake_projections`. Disable with `ENABLE_CAP13_BRAKE_WEAR_WORKER=false`.

## Frontend

- `/maintenance/brakes` — `BrakeWearDashboard` at-risk fleet list
- `BrakeWearGauge` — green / amber / red vs DOT threshold
- `UnitBrakesTab` — per-unit gauges + history (Brakes tab on `UnitDetail`)

## Downstream

Feeds **GAP-17** Arriving Soon queue with `brake_wear` alerts (see `todays-attention/aggregator.service.ts`).

## CI guard

`scripts/verify-cap-13-brake-wear.mjs` — migration, worker, routes, dashboard + tab wiring.
