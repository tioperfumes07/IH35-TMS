# PM-SCHEDULE-TABLE-CONSOLIDATION (design-first) — tracked decision

**Status:** OPEN design decision (Jorge-gated). Created 2026-06-21 from the #37 PM-countdown trace.
**Non-financial.** Do NOT consolidate on a guess — this doc captures the finding for a proper design pass.

## Why this exists
GUARD confirmed the PM Countdown card (OIL/TIRES/DOT/BRAKE) shows "0 / No active schedule" even with
mileage flowing. The odometer plumbing is now fixed (below); the remaining blocker is a **two-system
split** + **no schedule rows**, which is a data-model decision, not a snap fix.

## Finding: TWO disconnected PM systems
| System | Schedule table | Odometer reader | Consumers |
|---|---|---|---|
| **A — Countdown card** | `maint.pm_schedule` (singular) | `/api/v1/maint/pm/due` (pm.routes.ts) | `MaintenancePmCountdownCards`, `/maintenance` |
| **B — Auto-engine** | `maintenance.pm_schedules` (plural) | `pm-auto-engine.service.ts loadUnitOdometers` | cron, `pm_alerts`, auto WO-generation, `maintenance-predictor` |

- They are **different tables in different schemas**, populated/read independently.
- `maint.pm_schedule` keys to `mdata.assets.id`; `maintenance.pm_schedules` keys to `unit_id`.
- Both schedule tables are **empty** (GUARD: `/maint/pm/due` → `rows:[]`; `/maint/pm/schedule` 404).

## Already fixed (the sure plumbing — shipped)
Both PM odometer readers were sourcing the current odometer from the empty Samsara **webhook**
`raw_payload` (the fleet POLLS, so that payload has no odometer). Repointed both to the live
`telematics.vehicle_latest_position.odometer_mi` (Samsara stats-poll ingest, migration `202606211400`):
- **#1294** — `/maint/pm/due` (card) reads live odometer; webhook fallback kept.
- **#1295** — `pm-auto-engine loadUnitOdometers` reads live odometer; webhook fallback kept.
- Guard: `scripts/verify-pm-due-live-odometer.mjs` locks both readers to the live source.

So odometer now flows to BOTH systems. They are still inert because no schedules exist.

## The decision (for Jorge / a design pass)
1. **Which schedule table is canonical?** Recommendation: **`maintenance.pm_schedules`** — it owns the
   most infrastructure (auto-engine, cron, `pm_alerts`, WO-generation, `maintenance-predictor`). Then
   point the countdown card's `/maint/pm/due` at it (or at the auto-engine output) so the card and the
   engine agree. Consolidating avoids two divergent schedule sets. (Do NOT delete the other table —
   ARCHIVE/repoint per additive-only.)
2. **Interval source:** the Block E services catalog `mdata.maintenance_services`
   (`interval_miles` / `interval_months` per `applies_to_type`, `is_safety_critical`). McLeod/Alvys
   model = per-asset PM schedule seeded from service templates. **Never invent intervals.**
3. **Last-completed baseline** per unit: from the last completed PM work order of that type, else an
   onboarding baseline (current odometer / install date) at seed time.
4. **The seed itself** (87 units × applicable categories) = `INSERT` into existing tables →
   **`[HOLD-FOR-JORGE]`** (data migration, TRANSP-scoped). This is `#37-Block-AO "PM Countdown SEED"`.

## Next step
Jorge picks the canonical table (1) + the last-completed baseline rule (3); then the seed is built as a
`[HOLD-FOR-JORGE]` migration with researched intervals from the services catalog. Until then the PM
countdown correctly shows "no schedule" (honest empty-state), not a fake number.
