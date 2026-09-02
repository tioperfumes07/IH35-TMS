# INBOX-CC-3 · GO-26/27 · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin` (or `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`). **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class (~54+ main env reds) — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`

## NOW

```
CC-3 — GO-26 TABLES + GO-27 GATE 1 B1 + GATE 3 BANK QUEUE

Jorge UNLOCKED full capacity. WAIT is over.

PART A — GO-26 TABLES: ONE COMPONENT, RETIRE THE OTHER THREE

  KEEP    components/parity/ParityTable.tsx     373 files
          drag-resize, drag-reorder, auto-fit, persists per table
  RETIRE  components/DataTable.tsx
  RETIRE  components/shared/ResizableTable.tsx
  RETIRE  components/shared/MobileOptimizedTable.tsx
  CONVERT 43 files still rendering a raw <table>

WAIT for CC-2's guard to land before you start converting. The guard stops new
raw tables being written behind you.

WAVE ORDER — Jorge's daily screens first:
  1 DispatchBoard · TripPairingBoardPage · PlannerCalendarPage · BookLoadModalV4
    WorkOrdersTable · WorkOrdersConsoleListPage · FleetTable · FleetOosStrip
    DriverSchedulerGridPage · TaskPlannerGrid
  2 money screens   3 reports   4 home and program

PART B — GO-27 Gate 1.2: B1 AlwaysTrack legacy label
  BookLoadModalV4.tsx:1589 — remove "AlwaysTrack load # (legacy)" machine name.

PART B2 — GO-27 Gate 1: location + state comboboxes on Book Load stops
  Pickup/delivery State must be filter-combobox (K2/CC-2 Combobox), not plain input.
  Location picker on stops — prove on 13508 (0 of 2 location_id today).

PART B3 — GO-27 Gate 1: Book Load QB format + box sizing (Jorge reiteration)
  Apply GLOBAL-TYPE-SIZE-BASELINE.md to BookLoadModalV4: equal paired-field sizes,
  body 12px, headers 11px/700/UPPERCASE/#4B5563, cell padding ~7px. QuickBooks-style
  density on Section A charge rows and miles strip. One PR on wizard shell only.

PART C — GO-27 Gate 3.1 (queued): Bank categorization queue build.
  CC-3 builds; Jorge categorizes. Blocked on Gate 0 purge.

CONVERSION RULES:
  1. Keep every existing column, same order, same formatting.
  2. Give each table a STABLE storageKey.
  3. STOP RULE — financial statements: if ParityTable cannot express subtotals, STOP.
  4. One PR per wave. Live Chrome screenshot per wave.

Delete a retired component only when its import count reaches ZERO.
Column headers: 11px, weight 700, UPPERCASE, #4B5563, CENTERED, SORTABLE.
```

ACK `CC-3 | ACK | GO-26 ParityTable · B1 AlwaysTrack · wait CC-2 guard · NEVER POST | GO`
