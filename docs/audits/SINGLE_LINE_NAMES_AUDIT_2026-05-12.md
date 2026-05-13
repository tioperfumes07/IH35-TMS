# Single-line names audit (invariant #23)

**Date:** 2026-05-12  
**Scope:** Read-only inventory per IH35-TMS-MASTER-RULES.md §F invariant **#23** (all names/titles/headings on one line — no multi-line wrapping).  
**Method:** `git grep` on `apps/frontend/src/**/*.tsx` for `full_name|legal_name|display_name|customer_name|driver_name|vendor_name|assigned_primary_driver_name`, then manual classification of **render paths** (skip type definitions and form `value=` bindings unless visibly echoed as read-only labels).

## Inventory

| Metric | Value |
|--------|------:|
| Grep hits (lines) | 250 |
| Unique `.tsx` files with ≥1 hit | 108 |
| Render sites reviewed for wrap risk | 38 |
| **PASS** (nowrap / truncate / ellipsis / fixed single-line pattern) | 11 |
| **VIOLATION** (no `whitespace-nowrap` + no `truncate` / no `ellipsis` on name container) | 27 |

**PASS examples (compliant single-line treatment):**

- `apps/frontend/src/pages/Drivers.tsx` — driver list name column: `className: "max-w-[220px] whitespace-nowrap"` + inner `truncate` (`~491`).
- `apps/frontend/src/pages/Customers.tsx` — customer column: `max-w-[240px] whitespace-nowrap` + `truncate` on `row.name` (`~337–338`).
- `apps/frontend/src/pages/accounting/VendorBalancesPage.tsx` — `truncate` on vendor title (`~91`).
- `apps/frontend/src/pages/legal/sign/LegalSignPage.tsx` — long template title uses single-line heading (verify ellipsis in follow-up if H1 can exceed viewport).

## Seven visible hotspots (directive 4.3)

Long fixture used for mental model: **"ANTONIO RAMIREZ-MARTINEZ JR."**

| Area | File | Verdict | Notes |
|------|------|---------|-------|
| Drivers list | `pages/Drivers.tsx` | **PASS** | Primary drivers tab uses `whitespace-nowrap` + `truncate` on full name. |
| Drivers teams grid | `pages/Drivers.tsx` | **VIOLATION** | Team `primary_driver_name` / `co_driver_name` / `team_name` rendered as plain strings with no column `className` (`~443–445`). |
| Customers list | `pages/Customers.tsx` | **PARTIAL** | Customer **name** PASS; **Main Contact** raw `main_contact_name` (`~362`) can wrap. |
| Dispatch loads | `components/dispatch/DispatchList.tsx` | **VIOLATION** | `customer_name`, `assigned_primary_driver_name` in `<td className="px-3 py-2">` (`~120`, `~124`); card rows (`~150`, `~155`) same. |
| Bills / invoices list | `pages/accounting/InvoicesListPage.tsx` | **VIOLATION** | `invoice.customer_name` in plain `<td>` (`~169`). |
| Maintenance WO list | `pages/maintenance/components/WorkOrdersTable.tsx` | **LOW** | Column is **driver_id** / ids, not full name (`~83`); still dense table without nowrap — optional hygiene only. |
| Safety scheduler | `pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx` | **VIOLATION** | `driver_name` in compact `<td>` (`~45`). |
| User detail | `pages/UserDetail.tsx` | **VIOLATION** | Company `legal_name` in free-wrapping `<div className="text-xs text-gray-500">` (`~277`). |

## Top 20 violations (fix backlog)

| file:line | Element | Current CSS / pattern | Proposed fix |
|-----------|---------|----------------------|--------------|
| `components/dispatch/DispatchList.tsx:120` | `customer_name` cell | `td` default wrap | `max-w-* whitespace-nowrap` on col; inner `span.truncate` |
| `components/dispatch/DispatchList.tsx:124` | `assigned_primary_driver_name` | same | same |
| `components/dispatch/DispatchList.tsx:150` | List card customer | `text-sm` block | `truncate` + `min-w-0` flex child |
| `components/dispatch/DispatchList.tsx:155` | List card driver | inline span | `truncate` / `whitespace-nowrap` |
| `pages/Customers.tsx:362` | `main_contact_name` | plain text | wrap in `span.block.truncate`; col `max-w` |
| `pages/Drivers.tsx:443` | `team_name` | default DataTable cell | add `className` + `truncate` on render |
| `pages/Drivers.tsx:444` | `primary_driver_name` | plain string | `truncate` span + col nowrap |
| `pages/Drivers.tsx:445` | `co_driver_name` | plain string | same |
| `pages/UserDetail.tsx:277` | `company.legal_name` | `text-xs` div | `truncate` or single-line flex with `min-w-0` |
| `pages/accounting/InvoicesListPage.tsx:169` | `customer_name` | plain `<td>` | truncate pattern |
| `pages/driver-finance/CashAdvanceRequestsPage.tsx:120` | `driver_name` | table cell | nowrap + truncate |
| `pages/driver-finance/EscrowDeductionsPendingTab.tsx:135` | `driver_name` | table cell | nowrap + truncate |
| `pages/Home.tsx:143` | `driver_name` in row | flex span | `min-w-0 truncate` |
| `pages/driver-finance/components/SettlementDisputesTab.tsx:140` | `driver_name` | `<td>` | truncate |
| `pages/banking/BankingHome.tsx:254` | `vendor_name` | `font-medium span` | verify parent width; add `truncate` |
| `pages/factoring/FactoringHome.tsx:214` | `customer_name` | `<td>` | truncate |
| `pages/lists/fleet/FleetCatalogListPage.tsx:110` | `display_name` | `<td>` | truncate |
| `pages/lists/driver/DriverCatalogListPage.tsx:97` | `display_name` | `<td>` | truncate |
| `pages/lists/safety/CivilFineTypesListPage.tsx:80` | `display_name` | `<td>` | truncate |
| `pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx:45` | `driver_name` | `<td>` | truncate |

## Follow-up (out of scope for this commit)

- Apply **one** grid pattern everywhere for entity names in tables: column `whitespace-nowrap max-w-[…]` + cell `min-w-0` + `truncate` (or shared `EntityNameCell` primitive).
- Re-audit **legal** and **catalog** modules after first pass (many `display_name` cells repeat the same gap).
- Optional CI: lint or stylelint rule for forbidden raw `{name}` in `<td>` without truncate (high false positives — tune later).

**No code or CSS was changed in this commit.**
