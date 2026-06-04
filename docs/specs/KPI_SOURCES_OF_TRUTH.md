# KPI Sources of Truth

Canonical definitions for dashboard tile counts. Any UI label must match the query documented here.

| KPI NAME | LABEL | CANONICAL QUERY | SOURCE TABLE | REFRESH |
| --- | --- | --- | --- | --- |
| Active Loads | Active loads (Dispatch) | `COUNT(*)` where `status IN (assigned_not_dispatched, dispatched, at_pickup, in_transit, at_delivery, delivered_pending_docs)` and `soft_deleted_at IS NULL` | `mdata.loads` | `GET /api/v1/dispatch/dashboard` · 60s poll on Dispatch page |
| In Transit | N in transit (Dispatch subtitle) | `COUNT(*)` where `status IN (at_pickup, in_transit, at_delivery)` | `mdata.loads` | Same dashboard endpoint field `in_transit` |
| Active GPS Positions | Live GPS positions (Dispatch map feed) | `listLatestPositions` row count for company | `telematics` latest positions API | 30s poll · B6 canonical endpoint |
| Driver Escrow Balance | Escrow Balance (DIP) | `SUM(current_balance)` where banking tile `tag = 'Escrow'` | `views.banking_account_tiles` | `GET /api/v1/banking/dashboard/kpis` |
| Drivers with Escrow Balance | Drivers with escrow balance (Banking visualizer) | `COUNT(*)` active drivers where `escrow_balance > 0` | `mdata.drivers` | Same banking KPIs payload field `drivers_with_escrow_balance` |
| Active Drivers | Active drivers (Drivers / Banking) | `COUNT(*)` where `deactivated_at IS NULL` and `status = active` | `mdata.drivers` | Banking KPIs `active_drivers` · Drivers page list filter |
| Open Work Orders | Open WOs (Maintenance) | Maintenance KPI `open_wos` from maintenance dashboard API | `maintenance.work_orders` | Maintenance home KPI row |
| PM Due | PM Due (Maintenance) | Maintenance KPI `pm_due` / `past_due_pm` | PM schedule views | Maintenance home KPI row |
| Past Due Bills | Pending Bills (Banking) | `COUNT(*)` bills `status IN (open, partially_paid)` | `accounting.bills` | Banking KPIs `pending_bills` |
| Open Receivables | Open AR (Accounting / 425C) | Invoice AR open balance rollup (425C line 25 / AR aging) | `accounting.invoices` | Accounting reports · not a single tile today |

## Resolved contradictions (prod audit 2026-05-24, Block B7)

1. **Dispatch Active Loads vs in-transit subtitle** — Tile used paginated client-side load list (often 0); subtitle was hardcoded `14 in transit`. Fixed: both values from `/api/v1/dispatch/dashboard` (`active_loads`, `in_transit`).
2. **Dispatch map GPS positions** — Resolved by Block B6 (`listLatestPositions` on Dispatch page). K2 verified in B7; no duplicate stale endpoint.
3. **Banking Driver Escrow vs active drivers** — Visualizer showed Plaid account count as "Active drivers". Fixed: escrow balance count + `active_drivers` from `mdata.drivers`; DIP tile relabeled "Escrow Balance (DIP)".

## Resolved drifts (P8-AUDIT-KPI-DRIFTS, 2026-06-04)

| KPI | Drift | Fix |
| --- | --- | --- |
| HOME Active Loads | `open-loads-count` omitted `at_pickup` / `at_delivery` and `soft_deleted_at` | `countActiveDispatchLoads` via `apps/backend/src/kpi/canonical-kpis.ts` |
| HOME Open WOs | Broader `NOT IN (complete,…)` than maintenance open WOs | `countOpenMaintenanceWorkOrders` |
| HOME Drivers on duty | Today-only + narrow statuses vs assigned drivers on active loads | `countDriversOnActiveLoads` |
| HOME Assigned / Working | Reports counted non-active load statuses | Same canonical driver-on-active-load count |
| Maint PM Due vs Past Due | Both used `pm_alerts` count | `countPmDueAlerts` vs `countPastDueMaintenanceWorkOrders` |
| Reports Maint Past Due | Inline SQL diverged from maintenance past-due | Shared `countPastDueMaintenanceWorkOrders` |
| Banking Pending Bills | Inline duplicate query | `countPendingBills` |
| Dispatch In Transit | Already B7/B6 canonical | Re-exported from `canonical-kpis.ts` for audit parity |

## Follow-up (document only)

| Area | Observation |
| --- | --- |
| ACCOUNTING | No single "Open Receivables" home tile; AR spread across invoices list and 425C. |

## Implementation references

- `apps/backend/src/kpi/canonical-kpis.ts`
- `apps/backend/src/dispatch/active-loads-count.ts`
- `apps/backend/src/banking/driver-escrow-counts.ts`
