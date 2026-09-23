# LEAD RULING — FILTER-MULTI-01 (CC-2 lane cross on `scripts/verify-*.mjs`)

Owner/Lead packet, verbatim:

> CC-2 — FILTER-MULTI-01. Every money list. Verify live in Chrome before you
> report.
>
> DEFECT (owner, live): Driver Bills, Bills, and every money register show
> filters as BUTTONS/chips instead of dropdowns, single-select where they must
> be multi, plus redundant search boxes.
>
> REQUIRED ON EVERY MONEY LIST — Bills, Driver Bills, Expenses, Invoices,
> Journal Entries, Load Costs, Settlements, Factoring, Fuel, Banking:
>  1. Every filter is a DROPDOWN. No button rows, no chip strips, no segmented
>     controls standing in for a filter.
>  2. MULTI-SELECT with checkboxes on: Status, Vendor, Customer, Category,
>     Type, Unit, Trailer, Driver, Load, Account, Class. Closed label reads
>     "Status (3)" — never a truncated list.
>  3. ONE search box per page. Remove the second/duplicate search — several
>     pages have the page toolbar's search AND ParityTable's own.
>  4. ONE gear. ONE date range control (From/To + presets), not two.
>  5. Selections persist per page in the same storageKey the table already
>     uses, and clear with a single "Clear all".
>  6. Dash never blank in any filtered cell.
>
> This is a SWEEP, not one page at a time — §9.0.17. One shared filter
> component, one generalized guard. If it renders in one it renders in all.
>
> GUARD: scripts/verify-money-list-filters-are-multiselect-dropdowns.mjs
>  - fails when any registered money list renders a filter as a button/chip
>    row instead of a dropdown
>  - fails when Status/Vendor/Category/Type/Unit/Load is single-select
>  - fails when a page mounts more than one search input or more than one gear
>  Required: 0.
>
> VERIFY LIVE IN CHROME on /accounting/bills, /bills/driver, /accounting/expenses,
> /accounting/invoices and /banking/transactions. Paste a screenshot of each
> with a multi-select open showing checkboxes and an "(N)" count. A green guard
> without the live screens is not done.

This authorizes CC-2 to author `scripts/verify-money-list-filters-are-multiselect-dropdowns.mjs`
(later broadened to `scripts/verify-money-list-toolbar-one-and-multiselect.mjs` per the follow-up
packet) — CC-1 lane per `docs/bus/LANES.md`, `scripts/verify-*.mjs` — and wire it into CI/the local
gate. The UI work itself (`apps/frontend/**`) needs no cross — SHARED lane, declared in the PR body
per `LANES.md`'s own SHARED section.

**Backend list-route filter params (narrow, additive-only):** true multi-select (`Status`,
`Category`, `Vendor`, etc. — "OR of several values", not one) requires the affected list route to
accept an array/CSV param and filter with `IN (...)` instead of `= $1`, on pages whose backend
route sits in another seat's lane — named directly in the packet: Bills/Driver Bills/Journal
Entries/Load Costs (`apps/backend/src/accounting/**`, CC-1) and Settlements/Fuel
(`apps/backend/src/driver-finance/**`/`apps/backend/src/fuel/**`, CC-3). This ruling authorizes
CC-2 to widen exactly the existing single-value filter param(s) on each named list route to also
accept an array, additive and backward-compatible (a single value still behaves exactly as today;
no existing param removed, no response shape changed, no new GL/business logic). Twelve pages named
across the two packets: Bills, Driver Bills, Expenses, Invoices, Journal Entries, Load Costs,
Settlements, Factoring, Fuel, Banking, Customers, Vendors.
