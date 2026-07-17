# SAFETY-KPI-DRILLTHROUGH — Safety Home KPI / alert drill-through

**Block:** `FIX-SAFETY-HOME-KPI-DRILLTHROUGH` · **Branch:** `fix/safety-home-kpi-drillthrough`

## Problem

Safety Home surfaced aggregate KPIs and Safety Officer alerts, but every "action" dropped the user on a
generic list tab (or, for open workers-comp claims, a **bare `/safety`**). There was no path from a
number straight to the specific **driver / unit / record** behind it — the officer had to re-find the
row by hand.

## Fix (root cause, not a patch)

Deep-link to the specific record using ids the backend **already returns** — no new API surface, no
migration, no fabricated route.

### Frontend — `apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx`

- KPI tiles are now links to their **scoped** list surfaces (`/safety/safety-events`,
  `/safety/accidents`, `/safety/external-fines`, `/safety/integrity-alerts`, `/safety/csa-score`) —
  never a bare `/safety`.
- A new **"Records needing attention"** panel (`data-testid="safety-home-drilldown"`) lists the open
  driver-/unit-linked records and drills straight to them via the CI-verified `EntityLink` detail
  routes (`/drivers/:id`, `/fleet/units/:id`). Ids come from the existing endpoints:
  accidents (`driver_id` / `unit_id`) and events-log (`subject_driver_id` / `subject_unit_id`).

### Backend — `apps/backend/src/safety-officer/role-views/safety-home.service.ts`

- When a single distinct driver/unit is behind an alert (DVIR major defects, HOS today, accidents 7d,
  pending D&A), the alert `action_url` deep-links straight to `/drivers/:id` or `/fleet/units/:id`, and
  the alert carries `subject_driver_id` / `subject_unit_id` for reverse linkage. Multiple subjects keep
  the scoped list route (honest — a many-subject list must not masquerade as a single-record link).
- The old **bare `/safety`** workers-comp `action_url` is replaced with `/safety/home`.
- Subject columns verified on Neon prod branch `br-fancy-credit-akjnd07a`:
  `accident_reports.driver_id/unit_id`, `hos_violations.driver_id`, `dvir_defects.unit_id`,
  `da_test_records.driver_uuid`. `count(DISTINCT …)` guards against picking one subject out of many.

## Guard

`scripts/verify-safety-kpi-drillthrough.mjs` → npm `verify:safety-kpi-drillthrough`, wired into
`.github/workflows/ci.yml`. Asserts the FE drill panel + KPI links carry a driver/unit/record id and
never a bare `/safety`, and that the backend alerts deep-link to `/drivers/:id` / `/fleet/units/:id`
with `subject_*` linkage and no bare `/safety`.

## Scope

No GL / posting. Primary buttons remain `+ Create`. Read-only ids; no migration.
