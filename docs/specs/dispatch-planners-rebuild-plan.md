# Dispatch Planners — Rebuild Plan (P3, plan-first)

**Status:** DESIGN — Phase 0 (diagnosis) DONE; build awaits Jorge's answers on the 3 forks (§6).
**Date:** 2026-06-22
**Trigger:** GUARD live trace — `/dispatch/planners/{driver,truck,loads}` "works but wrong design + empty grid."

---

## 1. What's there today (live)

`DispatchPlannersLayout` renders a `PageHeader` + a 3-tab nav + a `UniversalFilterBar`, then one of:

| Tab | File | Data source | Shape |
|-----|------|-------------|-------|
| Driver Planner | `DriverPlanner.tsx` → `SafetyDriverSchedulerGrid` | `driverSchedulerOfficeApi.getGrid` (Safety **leave** scheduler) | drivers × dates leave grid |
| Truck Planner | `TruckPlanner.tsx` | planner-week grid + `mdata.units` + units-without-load | trucks × dates grid |
| Loads Planner | `LoadsPlanner.tsx` | `getDispatchPlannerWeek` (`/dispatch/planner/week`) | loads × dates bars |

All three share `PlannerRangeContext` (one date window, default ~30 days). **Three different backends feed three
different grids** — there is no single planner model.

## 2. Phase 0 — Why the Driver grid is empty ✅ DONE (code-traced, not a guess)

**Root cause = wrong data source.** `DriverPlanner` renders `SafetyDriverSchedulerGrid`, fed by
`driverSchedulerOfficeApi.getGrid` — the **Safety leave scheduler** (vacation/sick/personal/wfh). It renders one
row per driver and colours a day cell **only when a leave event exists**; the Unit column is `dr.unit_number`
else `—`. So with nobody on leave in the window, every cell is blank and units show `—`. **It is a leave
calendar, not a dispatch planner.**

- **Not a mapping bug** — `leave_day_cells` is mapped correctly; there's simply no leave data, and leave is the
  wrong feed for a dispatch planner.
- **Fix is viable with the EXISTING dispatch feed — no backend work.** `getDispatchPlannerWeek` already returns
  `drivers[]` (`id`, `name`, `unit_number`, `hos_status`, `blackouts`) + `loads[]` with `driver_id`, `start_at`,
  `end_at`. A real driver planner renders one row per driver with their **load bars** across the range — the same
  renderer as the Loads planner, pivoted by driver.

> I cannot run the live prod query (prod DB gated, §1.5), but the data-source mismatch is unambiguous from the
> code — the Driver grid never reads dispatch assignments at all.

## 3. The view system to emulate — Tasks module (PREVIEW-FROM-LIVE)

`TasksModuleTabs` ships **one module, many views over the same data**: Task Board (kanban), Calendar, My Tasks,
Team Chat, Admin Report, plus `TaskPlannerGrid`. Key idea: **tabs switch the *view*, not the *dataset*.** The
planners today switch *both* — three feeds — which is the design mismatch.

## 4. Benchmark — McLeod / Alvys

Both treat a dispatch planner as a **capacity-vs-load timeline**: resource rows (driver/truck) × a time axis,
**load blocks** placed on the timeline, click a block → load drawer, drag to re-time/re-assign, empty trucks
surface as open capacity to fill. Assignment-centric, not leave-centric.

## 5. Proposed rebuild (phased — each phase shown/approved, NOT auto-merge-blind)

- **Phase 0 — Diagnose empty grid. ✅ DONE (§2).**
- **Phase 1 — Tabs-as-views shell.** One planner surface, shared range + filter bar; tabs = views over a unified
  capacity model (Resource = driver|truck, overlaid with load blocks). Reuse `PlannerRangeContext` +
  `UniversalFilterBar`. Additive — existing 3 tabs stay.
- **Phase 2 — Capacity-vs-load timeline.** Resource rows × date axis; load blocks from the planner-week feed;
  each block clickable → `LoadDetailDrawer`; empty trucks render with the **+ Book load** action (reuses the
  per-truck prefill shipped in #1333/#1337).
- **Phase 3 — Assign/re-time.** Drag a block to re-time (`patchDispatchPlannerLoadStartAt` exists) / re-assign;
  optimistic + revert (Kanban pattern).
- **Phase 4 — Calendar + list views** over the same model (mirror Tasks).

## 6. Open questions for Jorge (decide before Phase 1)

1. **Driver planner data source:** show **load assignments** (dispatch — fixes the empty grid), **leave/availability**
   (Safety, today's behavior), or **both layered**?
2. **Scope:** unify into ONE Tasks-style board (recommended), or keep 3 separate tabs and only fix the empty grid
   + restyle?
3. **Drag-to-assign:** in scope now, or timeline-view first and assignment later?

*No build against this plan until Jorge answers §6. Phase 0 (diagnosis) required no decision and is complete.*
