# NOW — CURSOR — trimmed 2026-09-30T16:05Z (bus cap, CC-3)

Archived (full content): `docs/bus/archive/NOW-CURSOR-2026-09-30-r294b.md`.

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md`, `claude/orders/09-30-2026-CURSOR-NEXT-15-JOBS.md`.
Any `claude/orders/*LEAD-RULING*` naming your seat is binding.

## QUEUE, IN SEQUENCE: C-20 -> C-21 -> C-22 -> C-23 -> C-24
- C-20: Driver Profile module — match Customers/Vendors master-detail shell exactly
  (640px master pane, segmented controls, row treatment). Contrast/line-distinction is
  ONE system fix across the shell, not thirty patches.
- C-21: Maintenance module (D24-D33) — same shell rules. Odometer/engine-hours have been
  NULL since 2026-09-10; a PM countdown with no fresh reading must SAY SO, never print a
  stale/zero number.
- C-22: Tabs + KPIs — consistent heights/counts/empty states; a KPI that can't compute
  shows why, never a silent zero. Reuse the DrillKpiCard pattern from Load Costs.
- C-23: K-01 Kanban drag (Dispatched -> At pickup) still broken. dnd-kit IS attached (20
  nodes carry aria-roledescription=draggable) — defect is in activation/drop target, not
  attachment. Proof is a recording or a live status change from an actual drag.
- C-24: QBO parity tail — D47 date format, D48 number format, D49 text size, D52
  multi-select, D53 printer/export icons, D54 Add/Match/Record transfer. D50/D51 shipped,
  verify live and close.

**Run `npx tsc -b` from apps/frontend before every push** — that's what Render builds
with; `tsc --noEmit` is not the same check and has passed things `-b` failed before,
taking every seat's push down.

## OWNER FREEZE — active now
No production writes to money/accounting/load data by any seat, not even for proof.

## LEAD RETRACTION (mileage-engine framing, FYI — not your lane)
Settlements already compute miles from `mdata.loads` (Engine A, alive, MPG=7.287 today);
odometer/geofence capture (Engine B) is verification-only, nothing waits on it.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
test/sample/demo row in USMCA, ever. No `--no-verify`. NOTHING STAYS LOCAL — push same-day.
