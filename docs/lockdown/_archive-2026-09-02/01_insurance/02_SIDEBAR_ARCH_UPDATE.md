# IH35_ARCHITECTURAL_DESIGN.md — sidebar update (apply, do not remove anything)

## Sidebar order — LOCKED 2026-06-07 (Insurance inserted at index 8)

Live config today = 21 items, no Insurance (regression — Insurance UI shipped PRs #351-353
but the sidebar entry was never added). Fix = INSERT Insurance at index 8. Result = 22 items.

| # | id            | label          |
|---|---------------|----------------|
| 1 | home          | HOME           |
| 2 | maintenance   | MAINT          |
| 3 | fuel          | FUEL           |
| 4 | dispatch      | DISPATCH       |
| 5 | driver-hub    | DRIVER HUB     |
| 6 | safety        | SAFETY         |
| 7 | drivers       | DRIVER PROFILE |
| 8 | insurance     | INSURANCE      |  <-- INSERT HERE (new)
| 9 | eld           | ELD            |
|10 | accounting    | ACCTG          |
|11 | bank          | BANK           |
|12 | factoring     | FACT           |
|13 | vendors       | VENDORS        |
|14 | customers     | CUSTOMERS      |
|15 | legal         | LEGAL          |
|16 | form_425      | FORM 425       |
|17 | drv_app       | DRV APP        |
|18 | lists         | LISTS          |
|19 | reports       | REPORTS        |
|20 | docs          | DOCS           |
|21 | users         | USERS          |
|22 | help          | HELP           |

- File: apps/frontend/src/components/layout/sidebar-config.ts — insert the insurance entry at index 8 of
  SIDEBAR_DEFAULT_ORDER. Preserve icons, active-route highlight, badge counts.
- Role-based ordering (SIDEBAR_ROLE_ORDER): insurance available to owner/office_admin/accountant/safety.
- Module count: bump expected count in scripts/verify-architectural-design.ts from 21 -> 22.

NOTE: Cash Flow page (separate, approved 2026-06-07) is also pending insertion BETWEEN eld and accounting
(its own block). Do NOT bundle Cash Flow into the Insurance block. One block = one concern.
