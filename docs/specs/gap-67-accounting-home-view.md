# GAP-67 — Accounting Home Role View

**Status:** Shipped (read-only display)  
**Role:** `Accountant` (also readable by Owner, Administrator, Manager)  
**Route:** `GET /api/v1/accounting/role-home?operating_company_id={uuid}`

## Purpose

Give the Accounting role a dedicated home dashboard focused on AR/AP aging, period-close countdown, pending journal/period-close items, and QBO sync queue depth — without any financial writes or new posting logic.

## Design constraints

- **Read-only:** Aggregates existing read endpoints/services only.
- **No mutations:** No POST/PATCH/DELETE from this view.
- **No new financial logic:** AR/AP totals come from `getArAgingReport` / `getApAgingReport`; period and QBO counts are simple SELECT aggregates.

## API payload

| Field | Source |
|-------|--------|
| `ar_aging` / `ap_aging` | Existing aging services (bucket cents) |
| `period_close` | `accounting.periods` open row |
| `pending_journal_approvals` | `accounting.period_close_warnings` count |
| `qbo.outbox_depth` | `integrations.qbo_sync_queue` pending/in_flight |
| `qbo.last_sync_at` | Latest synced queue row |
| `early_pay_discounts_expiring_this_week` | Open bills with payment-term discount window |

## Frontend

- `AccountingHome` — rendered when `auth.role === "Accountant"` via `HomePage` switch.
- `AccountingKpiBar` — AR total, AP total, period-close countdown.
- Aging bucket cards — AR + AP middle section.
- `AccountingPendingApprovalsPanel` — journal warnings, QBO depth, early-pay opportunities.

## CI

`npm run verify:accounting-home` — static guard for route registration, role branch, and component wiring.
