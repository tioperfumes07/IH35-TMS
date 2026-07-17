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
| `BANK-SORT-ROLLOUT-OPS` | Dispatch board columns, Settlements, Maintenance WO lists | **DONE (2026-07-16)** — see below |
| `BANK-SORT-ROLLOUT-SHARED` | Extract `SortableDataTable` contract if duplication exceeds 3 call sites | Additive only |

## `BANK-SORT-ROLLOUT-OPS` — status: SHIPPED (2026-07-16)

Reuses the shared `apps/frontend/src/hooks/useUrlSort.ts` hook that landed from the concurrent ACCT
PR (`?sort=`/`?dir=` URL persistence via `sortKey`/`sortDirection`/`onSortChange`). Added one
additive export to that hook — `toggleSort(key)`, the standard asc→desc→unsorted click-cycle — for
pages that render their own `<th>` markup via `TableHeaderCell` (dispatch board, settlements list)
instead of `ParityTable` (which manages its own internal 2-state toggle and is unaffected).
`useTableController` gained optional `initialSortKey`/`initialSortDir` so a page can seed its
client-side sort from the URL.

| Surface | File | What changed |
|---|---|---|
| Dispatch board (primary dispatch list) | `apps/frontend/src/pages/dispatch/DispatchBoard.tsx` | Replaced local `useState` sort with `useUrlSort`; expanded `DISPATCH_SORTABLE_COLS` to every plain-data column (added Trailer, Commodity, WO #) — HOS clocks/cargo-temp/live-GPS/risk/status-signal/driver-status remain exempt (computed live-widget cells, same carve-out class as the GLOBAL-SORT-RULE action-column exemption). |
| Settlements list | `apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx` | Had NO sortable headers before this block. Added `TableHeaderCell`-driven ASC/DESC on Driver, Period, Gross, Deductions, Net Pay, Status, Debt Flag (+ `useUrlSort`). "Loads" (placeholder "—", no real field yet) and "Action" are exempt. |
| Maintenance fleet table | `apps/frontend/src/components/FleetTable.tsx` | Already had full ASC/DESC via `TableHeaderCell` + `useTableController`; wired `useUrlSort` as the URL bridge (`initialSortKey`/`initialSortDir` + `onSortChange`) so the existing sort now survives a refresh/shared link. |
| Maintenance work-orders console | `apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx` | Backend `sort` is a fixed 4-value enum (server-paginated, not generic per-column asc/desc — no FE-only fix without a backend contract change, out of scope for this FE-only block). Persisted the existing sort dropdown's VALUE in `?sort=` so the choice survives a refresh/shared link. |

**Guard:** `scripts/verify-ops-sortable-headers.mjs` (wired `npm run verify:ops-sortable-headers` +
CI step in `.github/workflows/ci.yml` next to `verify:global-sort-rule`). Asserts: the hook exists
with the `sort`/`dir` param contract + `toggleSort`; the dispatch board's sortable-column allowlist
covers every plain-data column; the settlements table's `sortable: true` set matches; the fleet
table wires `useUrlSort` into `useTableController`'s new `initialSortKey`/`onSortChange` seams; the
WO console persists `?sort=`.

**Tracker entry for the WO-console gap:** the work-orders console's 4-value server sort enum is
NOT a per-column asc/desc contract. Making every WO-console column independently ASC/DESC would
require a backend `sort_key`+`sort_dir` contract change on `/api/v1/work-orders` — named deferral,
future block `BANK-SORT-ROLLOUT-WO-BACKEND` (owner approval required before backend work per Rule 16).

## Acceptance for each rollout block

- Every visible data column title is clickable ASC/DESC
- Sort persists in URL query where the list is shareable
- Guard: `scripts/verify-*-sortable-headers.mjs` (or extend table-header guard)
- LIVE proof on one list per module

## Out of scope here

- Changing tab counts / architectural design tabs
- Deleting any list surface
