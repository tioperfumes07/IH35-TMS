# IH35_ARCHITECTURAL_DESIGN.md — sidebar update (apply, do not remove anything)

## Sidebar order — LOCKED 2026-06-08 (source of truth: SIDEBAR_ITEM_IDS in sidebar-config.ts)

Live config = 21 items. Insurance is confirmed at index 7. Factoring is at index 9. driver-hub is NOT in the array yet (pending its own block).

| # | id          | label          |
|---|-------------|----------------|
| 0 | home        | HOME           |
| 1 | maintenance | MAINT          |
| 2 | fuel        | FUEL           |
| 3 | dispatch    | DISPATCH       |
| 4 | drivers     | DRIVER PROFILE |
| 5 | safety      | SAFETY         |
| 6 | accounting  | ACCTG          |
| 7 | insurance   | INSURANCE      |
| 8 | bank        | BANK           |
| 9 | factoring   | FACT           |
|10 | customers   | CUSTOMERS      |
|11 | vendors     | VENDORS        |
|12 | lists       | LISTS          |
|13 | reports     | REPORTS        |
|14 | legal       | LEGAL          |
|15 | docs        | DOCS           |
|16 | eld         | ELD            |
|17 | form_425    | FORM 425       |
|18 | drv_app     | DRV APP        |
|19 | users       | USERS          |
|20 | help        | HELP           |

Exact locked array (SIDEBAR_ITEM_IDS):
["home","maintenance","fuel","dispatch","drivers","safety","accounting","insurance","bank","factoring","customers","vendors","lists","reports","legal","docs","eld","form_425","drv_app","users","help"]

- File: apps/frontend/src/components/layout/sidebar-config.ts — SIDEBAR_ITEM_IDS is the single source of truth. 21 items. Additive only; never remove/reorder.
- Role-based ordering (SIDEBAR_ROLE_ORDER): insurance available to owner/office_admin/accountant/safety.
- Module count: scripts/verify-sidebar-contract.mjs asserts length === 21.

NOTE: Cash Flow page (separate, approved 2026-06-07) is also pending insertion (its own block). Do NOT bundle Cash Flow into the Insurance block. One block = one concern.
NOTE: driver-hub is NOT in SIDEBAR_ITEM_IDS yet — it is pending its own dedicated block.
