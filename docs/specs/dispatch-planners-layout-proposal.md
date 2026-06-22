# Dispatch Planners — Unified Layout Proposal (for Jorge sign-off BEFORE build)

**Status:** LAYOUT PROPOSAL — awaiting Jorge's OK before any code.
**Date:** 2026-06-22
**Forks (answered by Jorge):** (1) data = **both layered** (dispatch load assignments + Safety leave/availability);
(2) scope = **unify into ONE Tasks-style board**; (3) drag-to-assign = **later** (read-only timeline first).
**Diagnosis basis:** the empty Driver grid was the wrong data source (Safety leave only) — see
`dispatch-planners-rebuild-plan.md`. The dispatch feed (`getDispatchPlannerWeek`) already has `drivers[]` +
`loads[]` (with `driver_id`, `start_at`, `end_at`) — no backend work to populate the timeline.

## Tasks-module pattern being mirrored
`TasksModuleTabs` = one module, tabs switch the **view** over one dataset. The planners adopt the same:
one capacity dataset (resources × dates, with load bars + leave overlay), several views.

## Proposed layout

```
┌─ Dispatch Planners ──────────────────────────────── ← back  Dispatch › Planners ─┐
│  [ Timeline ]  [ Calendar ]  [ List ]                      (tabs = views, 1 data) │
│  Resource: ( Drivers ▾ )   Range: [ Jun 22 — Jul 21 ]   Filter ▾   Today  ◀ ▶     │
├──────────────────────────────────────────────────────────────────────────────────┤
│           │ 6/22 6/23 6/24 6/25 6/26 6/27 6/28 6/29 6/30 7/01 … (date axis)        │
│ ───────── ┼──────────────────────────────────────────────────────────────────    │
│ J. Garza  │      ▓▓▓ L-1042 (NB) ▓▓▓        ░░ PTO ░░      ▓▓ L-1051 ▓▓            │
│  T-171    │  (load bar = clickable → load drawer)   (leave = soft background tint) │
│ ───────── ┼──────────────────────────────────────────────────────────────────    │
│ M. Peña   │            ▓▓▓▓ L-1047 (SB) ▓▓▓▓                                        │
│  T-184    │                                                                        │
│ ───────── ┼──────────────────────────────────────────────────────────────────    │
│ (idle)    │   ·····  open capacity  ·····              [ + Book load ]            │
│  T-209    │   (no load in range → surfaces as bookable, reuses #1337 prefill)      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### View tabs (all over the SAME dataset)
- **Timeline** (default) — resources × date axis; **load bars** placed by `start_at..end_at`; **leave/PTO**
  layered as a soft cell tint/badge (the Safety feed). Each load bar → opens `LoadDetailDrawer`. Idle resources
  show **+ Book load** (reuses the #1337 per-truck prefill). *Read-only placement — no drag yet.*
- **Calendar** — month/week grid of the same loads + leave (mirrors `TasksCalendarPage`).
- **List** — flat sortable rows (resource, load #, lane, dates, status) — same data, table form.

### Resource selector (the "both layered" answer)
`Resource: Drivers | Trucks | Both`. Rows are drivers and/or trucks; each row overlays **its load bars** AND
**its leave/availability**. So the Driver view is no longer empty — it shows real dispatch assignments, with
leave as context, exactly as Jorge chose.

### Shared chrome (reused, not rebuilt)
`PlannerRangeContext` (one date window) + `UniversalFilterBar` stay. §7 palette, single-line headings,
`+ Book`/`+ Create` vocab. The existing 3 tabs (Driver/Truck/Loads) are **archived-not-deleted** — the unified
board replaces them as the default, old routes redirect in (additive).

## Build phases (each shippable, after sign-off)
1. **Timeline view** — resource rows + load bars from `getDispatchPlannerWeek`, clickable → drawer; idle →
   + Book. (Fixes the empty grid immediately.)
2. **Leave overlay** — layer the Safety scheduler leave/availability onto the same rows.
3. **Calendar + List views** over the same dataset.
4. **(Later, separate PR)** drag-to-re-time / drag-to-assign (`patchDispatchPlannerLoadStartAt` exists).

## Open for Jorge before build
- OK on the **Timeline-as-default unified board** (archiving the 3 separate tabs)?
- Default **Resource = Drivers**, or **Both**?
- Any must-have column/field on the Timeline rows beyond unit + driver + load bars?
