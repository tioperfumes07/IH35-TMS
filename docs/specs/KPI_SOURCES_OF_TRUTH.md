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

## Follow-up (document only, not fixed in B7)

| Area | Observation |
| --- | --- |
| HOME | `open-loads-count` uses a subset of active-load statuses; align with dispatch canonical set in a future block. |
| MAINT | `MaintKpiRows` maps `pm_due` and `past_due` from overlapping backend fields — confirm distinct definitions. |
| ACCOUNTING | No single "Open Receivables" home tile; AR spread across invoices list and 425C. |

## Implementation references

- `apps/backend/src/dispatch/active-loads-count.ts`
- `apps/backend/src/banking/driver-escrow-counts.ts`
