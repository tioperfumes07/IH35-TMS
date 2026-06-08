# DISPATCH LOCKDOWN — 2026-06-07 (paste to Cursor + append to blueprint/architecture)

Append these to UNIFIED_BLUEPRINT_ADDITIONS.md (and architecture where noted):
- 01_DISPATCH_ETA_MODEL.md           — blended ETA (Samsara + traffic + driver input + geofence + incidents + HOS)
- 02_DISPATCH_BOARD_VIEW_LOGIC.md    — List=Kanban format; Booked / Assigned units / Unassigned units; reserve-a-load; NO NB/SB section
- 03_SETTLEMENT_TRIP_LINKING.md      — pre-settlement triangulation (one open per driver; NB auto, SB joins, settle on return)
- 04_GLOBAL_UI_RULES.md              — sortable columns; filter-typeahead; Unit>Trailer>Load#; universal 6-col box sizing; date calendars; weight + currency formatting; never delete
- 05_BOOKLOAD_WIZARD_DEFECTS.md      — DO NOT redesign the wizard; fix the listed defects only
- 06_DISPATCH_MAIN_DEFECTS.md        — dispatch main page box sizing/alignment

CURSOR HANDLING:
- Each is RESPOND-BEFORE-CODE (RULE 6): inventory as-built vs spec, deltas, NEW spec, wait for GO.
- ADDITIVE ONLY. Never delete/reorder. Do NOT redesign the Book Load wizard — defect fixes only.
- Lane lock magnet files (sidebar-config.ts, App.tsx, verify-*). One writer per file per cycle.
- Add CI guards: sortable-column contract, currency/weight formatting, equal-field-size lint where feasible.

PENDING PREVIEWS (Claude builds next, to these specs + exact app colors):
1. Assignment board (Booked loads / Assigned units / Unassigned units) — column order Unit, Trailer, Load#.
2. Pre-settlement / settlement trip-linking view (NB+SB legs linked, totals, deductions, escrow, debt alert).
