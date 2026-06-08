# IH35-TMS — FULL LOCKDOWN (2026-06-07) — single package for Cursor + blueprint

Everything locked so far, with paste-ready Cursor blocks. ADDITIVE ONLY. ARCHIVE never DELETE.
Do NOT redesign the Book Load wizard (defect fixes only).

## Paste order to Cursor (each is RESPOND-BEFORE-CODE; wait for Jorge GO each time)
1. 01_INSURANCE/03_CURSOR_BLOCK_INSURANCE.txt            — sidebar index 8 + 4-step wizard (cost-per-vehicle, equal_split, N bills) + guards
   Gates already answered: G1-A (22, assert array length) · G2-A (atomic tx wrapping existing fns) · G3-B (add wizard, keep modal) · G4-B (Administrator)
2. 03_INSURANCE_SAFETY/04_CURSOR_BLOCK_INSURANCE_SAFETY.txt — per-unit coverage/limit/deductible/value + Safety panel + gaps (AFTER block 1)
3. 02_CASHFLOW/03_CURSOR_BLOCK_CASHFLOW.txt              — Cash Flow page (daily prediction + Actual vs Projected)
   Toggles answered: Q1-A (gross + factoring as expense) · Q2-A (delivery date; report uses settlement) · Q3-A (opening/closing) · Q4-A (7-day strip)
4. 06_GLOBAL/GLOBAL_CURSOR_BLOCK_SORT_UI.txt             — sortable columns app-wide (click=asc, again=desc) + typeahead + formatters
5. 05_DISPATCH_BLOCKS/A_CURSOR_BLOCK_ETA_MODEL.txt       — blended ETA (Samsara+traffic+driver+geofence+incidents+HOS)
6. 05_DISPATCH_BLOCKS/B_CURSOR_BLOCK_BOARD_VIEW.txt      — List=Kanban + Booked/Assigned/Unassigned + reserve-a-load
7. 05_DISPATCH_BLOCKS/C_CURSOR_BLOCK_SETTLEMENT_VIEW.txt — pre-settlement trip-linking view
8. 05_DISPATCH_BLOCKS/D_CURSOR_BLOCK_BOOKLOAD_DEFECTS.txt— Book Load wizard defect fixes (no redesign)
9. 05_DISPATCH_BLOCKS/E_CURSOR_BLOCK_DISPATCH_MAIN_DEFECTS.txt — dispatch main page sizing/alignment

## Blueprint / architecture appends (docs/specs + UNIFIED_BLUEPRINT_ADDITIONS.md)
- 01_INSURANCE/01_INSURANCE_BLUEPRINT_ADDITION.md, 02_SIDEBAR_ARCH_UPDATE.md, 04_CI_GUARD...md
- 02_CASHFLOW/01_CASHFLOW_BLUEPRINT_ADDITION.md
- 03_INSURANCE_SAFETY/02_INSURANCE_SAFETY_CONNECTION.md
- 04_DISPATCH_SPECS/01..06 (ETA, board view, settlement, global UI, wizard defects, main defects)
- 06_GLOBAL/GLOBAL_SORT_AND_UI.md

## Cursor answers (paste back)
INSURANCE: G1-A  G2-A  G3-B  G4-B   (G1 assert array length == 22, not hardcoded)
CASH FLOW: Q1-A  Q2-A  Q3-A  Q4-A
GLOBAL SORT: lock the click-header asc/desc rule app-wide + CI guard.
MERGES: GO-717/718/719 held until Claude verifies CI + merge state live; fix the module-count guard to assert real array length (22).

## Open confirmations
- Sort order rule: leave data BY LOAD by default; sorting any column is by clicking its header (asc, then desc). Locked.
