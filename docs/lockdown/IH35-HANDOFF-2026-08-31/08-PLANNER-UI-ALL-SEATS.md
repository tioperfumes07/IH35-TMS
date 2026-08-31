# PLANNER UI — CODE IS WRITTEN AND COMPILING. NEEDS REVIEW + TESTS + MERGE.
Owner reported three things; all three are reproduced with live DOM measurements and fixed.
`npx tsc --noEmit -p apps/frontend/tsconfig.json` → **exit 0**.

## PLAN-01 · "+ Book in its own column, name in one, unit in another" — ALL planners
`.pg-name` was ONE 240px flex cell holding up to **six** nodes with no separators. The driver
row literally rendered `PEDRO ABRAHAM LOPEZ COLLADOT149` and clipped 25px. The **+ Book button
was inside that same cell.**

`PlannerGridRow` now takes `name` · `secondary` · `unit` · `action`, and `.pg-name` is a CSS
grid of three real columns that align down the whole planner. Unit is fixed-width,
right-aligned, tabular, and **blank when absent — never a dash**.

**Applied to all five planners that had the defect:**
`UnifiedTimelinePlanner` (driver: name · status+util+customer · unit · **+ Book**) ·
`TruckPlanner` ×2 grids (unit · status · paired driver) · `SafetyDriverSchedulerGrid`
(driver · unit) · `LoadsPlanner` (load# · lane+customer). `RoundTripsTimeline` was already
a single clean node — untouched.

## PLAN-02 · "the loads are lost"
Measured: `.pg-scroll` clientWidth **653**, scrollWidth **1820** — **1167px (64%) hidden**,
with macOS overlay scrollbars invisible until touched and the view opening on the 1st of the
month. Fixed: opens **anchored on today** (a quarter in from the left), a forced-visible
scrollbar, live edge fades on both sides, and a banner counting bars outside the range.

## PLAN-03 · "the boxes seem cut off / text does not auto adjust"
Bar width comes from trip duration; the label is a fixed-length load number, and nothing
reconciled them. `LUSMCAFREIGHT-20260806-0001` needed **206px in a 100px bar — 106px cut**.
New `plannerBarLabelTier(label, widthPx)` picks the widest label that actually fits:
full → last two segments → last segment → **no text at all** (full value stays in `title`
and `aria-label`). Deterministic, no DOM measurement, unit-testable.

## PLAN-04 · "what are the numbers next to the tabs, it looks dirty"
Every tab carried an alert-coloured chip, so nothing stood out. `CountBadge` now:
hides at zero (was a grey "0") · alert colour **only** for exception queues (At-Risk,
Detention, Late, Border) while Load board / Assignments are muted inventory counts ·
and the pluralization bug is fixed — it announced **"1 items"**.

## STILL TO DO (Cascade owns)
- Unit tests for `plannerBarLabelTier()` — full / mid / tail / empty tiers.
- Assert **no `.pg-bar` renders a label wider than its own box** at 1280 / 1440 / 1920px.
- Assert **zero clipped `.pg-name` cells** (`scrollWidth <= clientWidth`) on all planners.
- Assert no tooltip in Dispatch reads `"1 items"`.

## FILES
`apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx` · `PlannerGrid.css` ·
`UnifiedTimelinePlanner.tsx` · `TruckPlanner.tsx` · `SafetyDriverSchedulerGrid.tsx` ·
`LoadsPlanner.tsx` · `apps/frontend/src/components/dispatch/DispatchSubnav.tsx`
