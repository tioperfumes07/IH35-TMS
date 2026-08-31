# PASTE ALL SEATS — 2026-08-31

**Canonical:** `docs/lockdown/GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31.md`

---

## → CASCADE

```
UI CONSISTENCY — REPORT ONLY THIS TURN (Cursor builds the fix)

Owner saw on /driver-finance/settlements:
  Open Driver Bills = ONE cell: "Driver · Load · Bill $456" — no columns, cannot sort.
Pre-Settlements panel same shape.

Also: Dispatch subnav is WRONG vs Driver Settlements:
  Settlements = navy rgb(26,31,54), 28px, one row, zero wrap
  Dispatch = white, 52px, labels wrap, 4 nav rows stacked

YOUR JOB NOW:
  1. Screenshot Settlements Open Driver Bills + Pre-Settlements list rows
  2. Screenshot Dispatch subnav vs Settlements subnav side-by-side
  3. Paste notes to board — DO NOT patch SettlementsPage alone

live_load_number (still active): REVERT 0008-0019 to NULL in Chrome — DO NOT redo AT#.
  See LAW-LIVE-LOAD-NUMBER-NULL-AND-OWNER-EDIT-2026-08-31.md

ACK: Cascade | ACK | UI-CONSISTENCY-AUDIT | NOW=screenshots+AT-null-revert|FREE=none | GO
```

---

## → CURSOR

```
P0: main typecheck (shared-types load-state-machine) FIRST — freeze other merges until green.

THEN — GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31:
  Part 1: shared navy subnav — Dispatch must match Settlements (28px, no wrap, max 2 rows)
  Part 2: shared DataTable — settlements columns DATE|DRIVER|LOAD|BILL|AMOUNT|STATUS sortable
  Part 3: audit table ALL modules BEFORE code
  GUARDS: verify-subnav-standard.mjs + verify-list-rows-use-datatable.mjs
  FORBIDDEN: settlements-only patch · dispatch-only subnav patch

ACK: Cursor | ACK | P0+UI-CLASS | NOW=main-build|FREE=ui-audit-table | GO
```

---

## → DEVIN-A

```
When auditing settlements/dispatch/pre-settlements in Live Chrome:
  Capture list row shape (columns vs middot jam) + subnav (navy 28px vs white wrap).
  See GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31.md — report only, Cursor ships fix.

ACK: Devin-A | ACK | UI-CONSISTENCY-AUDIT | NOW=next-OPEN-chrome|FREE=Miss-C | GO
```

---

## → CC-3

```
After Cursor ships UI class fix: wire verify-subnav-standard + verify-list-rows-use-datatable.
Until then: hold — audit table comes first.

ACK: CC-3 | ACK | UI-GUARDS-HOLD | NOW=guard-board|FREE=AT-null-hint | GO
```
