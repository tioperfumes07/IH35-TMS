# BANK-SORT-ROLLOUT — column ASC/DESC across remaining modules

**Status:** Named follow-up (owner law: never silent defer).  
**This block (2026-07-16):** Banking register + Reconciliation Workspace — every visible column header toggles ASC/DESC.

**BANK-SORT-ROLLOUT-ACCT (2026-07-16) — DONE for Bills + Expenses:** `ParityTable` (shared list
grammar) gained an OPTIONAL controlled-sort contract (`sortKey` / `sortDirection` / `onSortChange`
props + a per-column `sortValue` extractor) that a page opts into; a new shared
`apps/frontend/src/hooks/useUrlSort.ts` reads/writes `?sort=&dir=` via react-router search params.
`BillsPage` and `ExpensesListPage` are wired to it — every visible DATA column header is clickable
ASC/DESC (Bills' `balance` and `is_reconciled` columns, which lacked `sortable: true`, were closed
in this block too; `allocate` stays exempt as a pure action column). Sort persists in the URL and
survives reload / is shareable. Guard: `scripts/verify-accounting-sortable-headers.mjs`
(`npm run verify:accounting-sortable-headers`), wired into `.github/workflows/locked-guards.yml`.

## Remaining modules (next blocks)

| Block id | Scope | Notes |
|---|---|---|
| `BANK-SORT-ROLLOUT-ACCT` (remaining) | Accounting Customers, Vendors, A/P aging lists | Reuse `useUrlSort` + `ParityTable` controlled-sort props shipped in this block |
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
