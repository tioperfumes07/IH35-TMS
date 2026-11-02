# ENG-29 / ENG-53 — cron isolation + 13690 tip-proof (2026-11-02 CT)

## LIVE measure (USMCA)

| Metric | Value |
| --- | --- |
| Delivered with unit | 194 |
| `miles_driven_actual` filled | 45 |
| Missing | 149 |
| Stale NULL + stop times after `computed_at` | **2** (13690, 13698) |

### Load 13690

- Stored: `miles_driven_actual=NULL`, reason freeze `2026-10-22` ("stop 2 arrival: no geofence…")
- Stop 2 actual arrival `2026-10-28` (after computed_at)
- Tip `computeLoadRealDrivenMiles` → **1731.7** (`odometer:geofence->geofence` loaded leg); deadhead still NULL (manual stop 1, honest)
- Tip `persistLoadRealDrivenMiles` in rolled-back txn → **CHANGED 1**
- Tip recompute of all 194 due loads → **only 13690** is null→miles newly fillable

### Load 13698

- Still honestly NULL (manual stop times / no fence measurement on loaded leg boundaries)

## Root cause (tip-proven)

Hourly tick runs inside **one** `withLuciaBypass` transaction. Miles `persist` ran, then dwell-evidence / `captureGeofenceOdometerEvents` could throw and **ROLLBACK** the miles write. 13690 stayed NULL with Oct-22 `computed_at` while due_for_cron stayed true.

## Code fix (this ship)

1. `persistLoadRealDrivenMiles` **before** dwell evidence
2. Dwell evidence + odometer capture + recompute wrapped in **SAVEPOINT** `real_driven_miles_dwell_evidence` (failure isolated; miles commit)
3. `loadsDueForRealMiles`: NULL-miles **first**; also due when miles still NULL and stop actual times are **newer than** `computed_at` (outside 14-day window)
4. ENG-29 backfill script also targets stale-NULL class; `--apply` requires real `OWNER_AUTH_ID` (never invent)

## AUTH (not invented)

- Cron path needs **no** AUTH — next hourly `:25` America/Chicago after deploy should stamp 13690 → 1731.7
- One-shot historical apply still needs owner-issued OPEN AUTH via `OWNER_AUTH_ID`

## ENG-53 residual after deploy

- 13690 loaded miles: expect DONE via cron
- 13690 deadhead: remains NULL with named manual-stop reason (honest)
- 13698: remains NULL until fences/measured times exist
- T174 odometer: still UNVERIFIED (separate)
