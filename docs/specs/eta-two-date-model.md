# ETA two-date load model (Phase 7, BLOCK 1) — design

Tier-1, money-adjacent (feeds the cash forecast). Show-first. **This doc + the migration are
the `design→show→approve` step. Nothing merges until Jorge says "OK to merge."**

## Problem
A load has ONE delivery date today — the scheduled appointment, derived from the first delivery
stop (`mdata.load_stops`: `COALESCE(scheduled_arrival_at, appointment_start_at)`). The dispatch
board and the cash forecast both read that single date. To let late-detection move the cash
FORECAST (BLOCK 2) we need two cleanly-separated dates per load.

## Model
| concept | where | moves when |
|---|---|---|
| `scheduled_delivery_date` | UNCHANGED — derived from the delivery stop | only on a real customer reschedule (stop edit). Never by signals. |
| `predicted_delivery_date` | NEW nullable column on `mdata.loads` | floats from signals (BLOCK 2). Null ⇒ fall back to scheduled. |
| `predicted_source` | NEW text column | which signal set it (`scheduled_backfill` on first run; manual/dispatcher/samsara later). |
| `predicted_updated_at` | NEW timestamptz column | when the prediction last changed. |

`effective_delivery_date = COALESCE(predicted_delivery_date, <derived scheduled>)`.

We deliberately do **NOT** copy the scheduled date onto `mdata.loads` — keeping it derived avoids
two-source drift. Only the `predicted_*` columns are new.

## Migration (`db/migrations/202606170200_loads_predicted_delivery_date.sql`)
- Additive: 3 nullable columns, idempotent (`ADD COLUMN IF NOT EXISTS`).
- Backfill: open (non-terminal) loads get `predicted = derived scheduled`, `source =
  'scheduled_backfill'` so nothing reads NULL on day one. Terminal loads stay NULL (they read
  actuals, never a forecast).
- No FKs, no GL, no `accounting.*` touch. Per-entity RLS on `mdata.loads` unchanged. Fresh-DB
  validated by CI. Reversible (drop the 3 columns).
- No `predicted_source` CHECK in BLOCK 1 — the signal vocabulary is locked by BLOCK 2's
  confirm/audit path, so pinning it now would force a rework migration.

## Consumer wiring — built ON APPROVAL (same branch), not before
1. **Read-model helper** `effectiveDeliveryDate(load)` (backend `dispatch` + forecast read paths)
   = `COALESCE(predicted_delivery_date, scheduled_delivery_at)`. Single source of truth; the
   guard forbids any forecast consumer from reading a raw delivery date around it.
2. **Dispatch board** Delivery column shows `effective_delivery_date`; when
   `predicted > scheduled`, an amber "late vs appt" indicator (does NOT overwrite scheduled);
   hover/expand shows both dates.
3. **Static guard** `verify-load-delivery-dates-separated` — asserts forecast/board consumers
   read through the `effective_delivery_date` helper, never a single hardcoded delivery date.

## Boundary
This is scheduling/forecast data ONLY. Zero change to posted invoices, AR, settlements, or QBO.
BLOCK 2 (PROJECTED-CASH-FOLLOWS-ETA) consumes `effective_delivery_date` + receivable lag to
re-bucket the cash forecast, behind OFF flags, with a dispatcher confirm step and an audit row.

## Signal sources (RESOLVED 2026-06-17, Jorge)
- **No Samsara live ETA exists** — the `ETA_AUTO_FROM_SAMSARA` path is **dropped entirely** from
  BLOCK 2. `predicted_delivery_date` is set by **manual driver-app + dispatcher input only**, with
  the confirm step.
- **HOS is the in-app HOS store** (the service behind `/safety/hos` "Fleet duty status" +
  `/drivers/{id}/hos`), **not** Samsara. HOS (hours available vs. distance remaining) may inform the
  late-RISK signal that surfaces a proposed slip — but the predicted date itself is human-confirmed.
- No feed gate remains: the whole two-date + cash-lag + confirm + audit model is buildable now.
