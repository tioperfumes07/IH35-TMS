# QBO-Parity List View Standard

Canonical spec for list pages (`/customers`, `/vendors`, and future list pages).
Owner: CLOSURE-31. Reviewed by: CLOSURE-32 audit block.

## 0. Default view is the design the user already had (CLOSURE-31)

The single hardest rule, and the reason this document exists:

> **Never silently change the DEFAULT view a user is already using. New views
> are ADDITIVE and opt-in. Changing the default requires explicit sign-off.**

Background: AUDIT-FIX-3 (#531, commit `58f550690`, 2026-06-05) added an opt-in
tabular **"list"** view to `/customers` and `/vendors`. Jorge had asked for two
additive things only — multi-select checkboxes and column-width adjustment — but
#531 also flipped the **default** view from the prior **"master-detail"** design
to the new list view. That was an unrequested wholesale change and a live
regression.

CLOSURE-31 restores the default to `"master-detail"` while keeping the list view
available as an opt-in toggle. This is enforced by
`scripts/verify-customers-vendors-default-is-prior-design.mjs`, which fails CI if
the default is flipped back to `"list"` without sign-off.

- Default view: `master-detail` (the prior design).
- Opt-in view: `list` (the #531 tabular view), reachable via the header toggle.
- Per-user preference: persisted by `useViewModePref` (localStorage +
  `getUserPreferences`/`patchUserPreferences`). A user's explicit toggle choice
  is remembered; users who never toggled always land on the default.

## 1. QBO-parity features (target behavior)

Jorge's reference is QuickBooks Online. List pages should converge on:

- Tabular layout, one row per record.
- Per-row left-edge checkbox for multi-select.
- Sticky bulk action bar that appears when any row is selected.
- Column resize handles between columns, persisted per user.
- Sortable column headers (click to toggle asc/desc).
- Top filter row: Search | Status | Type | Balance | Date created | Clear.
- "+ New" button top-right; bulk import / export.

## 2. Already implemented (in the opt-in `list` view, via #531)

These are present today and should be reused, not reinvented:

- Multi-select checkboxes: `components/bulk/TableSelection` + `hooks/useBulkSelection`.
- Bulk action bar: `components/bulk/BulkActionBar`.
- Column resize handles: `components/shared/ResizableTh` + `hooks/useColumnWidths`
  (persists widths to localStorage per page).
- Per-user view-mode persistence: `hooks/useViewModePref`.

## 3. Deferred / pending Jorge sign-off (CLOSURE-31 did NOT build these)

The CLOSURE-31 dispatch block also called for net-new infrastructure
(`QBOStyleFilterRow`, `QBOStyleBulkActionBar`, `QBOStyleColumnResize`,
`useUserDefaultListView`, backend `list-view.routes.ts`, migration
`0405-user-list-view-preferences.sql`). These were intentionally **not** built in
the urgent restore PR because:

1. The block's named file paths (`pages/customers/CustomersPage.tsx`,
   `CustomersListLayout.tsx`, etc.) do not exist in this repo; the real files are
   `pages/Customers.tsx`, `pages/Vendors.tsx`, `pages/customers/CustomersListView.tsx`.
2. The requested capabilities largely **already exist** (section 2), so building
   parallel `QBOStyle*` components + a second preference store would duplicate
   working code — itself a wholesale change, which is what CLOSURE-31 is fixing.

The urgent fix is the default restore + recurrence guard. Any further QBO-parity
build-out should be a separate, scoped PR confirmed against this standard.
