# UNIFIED_BLUEPRINT_ADDITIONS.md — append (global UI rules, whole software)

## 2026-06-07 — GLOBAL UI RULES locked (apply everywhere, additive)

1. SORTABLE COLUMNS (like QuickBooks): every list/table column in the ENTIRE software sorts ascending /
   descending by clicking its header (click Load → order by load #; click Unit → by unit #; etc.). Toggle asc/desc.
2. COLUMN ORDER: always Unit → Trailer → Load # → ... (corrects prototype). Applies to every load/unit list.
3. FILTER-TYPEAHEAD, NOT PLAIN DROPDOWNS: selection lists are type-to-filter (type and it shows anything related).
   They MUST collapse when not focused, MUST allow unselect/clear, and MUST NOT block advancing when left empty.
   The current behavior (list stays visible, can't unselect, can't advance) is a defect to fix everywhere.
4. UNIVERSAL BOX-SIZE STANDARD: imagine six equal columns = the six status columns (Pending Assignment, Assigned,
   In Transit, Delivered, Completed, Cancelled). The click boxes/tiles on Load board, Assignments, Dispatch map,
   Settlements, etc. MUST size to that same six-column grid. Equal sizes, clean alignment, no oversized boxes.
5. EQUAL FIELD SIZES: paired fields are the same size — customer = customer WO #; factoring company = cash advance
   = fuel advance. No field arbitrarily larger than its neighbor.
6. CENTERED HEADERS: field/column headers centered (commodity, weight, etc.).
7. DATES / APPOINTMENTS / WINDOWS: clean calendar input — user can type and the date auto-formats/adjusts.
   Applies everywhere a date, appointment, or time window is entered.
8. WEIGHT: thousands separators (type 24600 → shows 24,600) and a kg/lbs toggle.
9. CURRENCY / ACCOUNTING FORMAT: money fields format correctly (type 4800 → 4,800.00, NOT 48.00). Applies to
   linehaul, fuel surcharge, accessorial, cash advance, fuel advance, and every accounting amount field.
10. NEVER DELETE, ALWAYS ADD. ARCHIVE never DELETE. Sidebar/modules/columns/fields are additive only.
