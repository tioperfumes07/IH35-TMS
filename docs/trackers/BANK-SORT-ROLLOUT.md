# BANK-SORT-ROLLOUT — column ASC/DESC across remaining modules

**Status:** Named follow-up (owner law: never silent defer).  
**This block (2026-07-16):** Banking register + Reconciliation Workspace — every visible column header toggles ASC/DESC.

## Remaining modules (next blocks)

| Block id | Scope | Notes |
|---|---|---|
| `BANK-SORT-ROLLOUT-ACCT` | Accounting Bills, Expenses, Customers, Vendors, A/P aging lists | Reuse `TableHeaderCell` + shared sort controller |
| `BANK-SORT-ROLLOUT-OPS` | Dispatch board columns, Settlements, Maintenance WO lists | Same header contract |
| `BANK-SORT-ROLLOUT-SHARED` | Extract `SortableDataTable` contract if duplication exceeds 3 call sites | Additive only |

## Acceptance for each rollout block

- Every visible data column title is clickable ASC/DESC
- Sort persists in URL query where the list is shareable
- Guard: `scripts/verify-*-sortable-headers.mjs` (or extend table-header guard)
- LIVE proof on one list per module

## Out of scope here

- Changing tab counts / architectural design tabs
- Deleting any list surface
