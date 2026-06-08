# GAP-43 — 6 Scheduled Reports Auto-Emailed (Q8)

Source: Q8 master rule (B_Jorge_Directives) — six standard auto-emailed reports with locked cadences. Recipients: Owner, Accounting, Safety, and CPA where noted.

## Database

Migration: `db/migrations/202606080206_scheduled_report_subscriptions.sql`

- `reports.scheduled_subscriptions` — cadence, recipients, next/last send timestamps
- `reports.scheduled_delivery_log` — per-send audit trail (`success` | `failed` | `bounced`)
- RLS tenant scope via `app.operating_company_id` + `ih35_app` grants
- Six default rows seeded per active operating company (idempotent `ON CONFLICT DO NOTHING`)

## Q8 default subscriptions

| # | Report slug | Cadence | Schedule (America/Chicago) | Recipients | Format |
|---|-------------|---------|------------------------------|------------|--------|
| 1 | `weekly-cash-position` | weekly | Monday 07:00 | Owner | pdf |
| 2 | `weekly-driver-settlement-preview` | weekly | Friday 08:00 | Owner + Accountant | pdf |
| 3 | `weekly-ar-aging-60` | weekly | Monday 08:00 | Owner | pdf |
| 4 | `monthly-pnl` | monthly | 1st 06:00 | Owner + CPA | pdf |
| 5 | `quarterly-ifta-preview` | quarterly | Quarter-end + 7 days 07:00 | Owner | pdf |
| 6 | `daily-safety-alerts-digest` | daily | 05:00 | Safety + Owner | html |

## Backend

- `apps/backend/src/reports/scheduled/subscription.service.ts` — CRUD (Owner-only mutations)
- `apps/backend/src/reports/scheduled/runner.service.ts` — `runDue()` generates report, emails via `enqueueEmail`, updates schedule, logs delivery
- `apps/backend/src/reports/scheduled/routes.ts` — REST API under `/api/v1/reports/scheduled/`
- `apps/backend/src/jobs/scheduled-reports-emailer.ts` — cron `*/15 * * * *` (15-minute tick)

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/reports/scheduled/subscriptions` | any member |
| POST | `/api/v1/reports/scheduled/subscriptions` | Owner |
| PATCH | `/api/v1/reports/scheduled/subscriptions/:uuid` | Owner |
| PATCH | `/api/v1/reports/scheduled/subscriptions/:uuid/deactivate` | Owner (never delete) |
| GET | `/api/v1/reports/scheduled/delivery-log` | any member |

## Frontend

- `/reports/scheduled` → `SubscriptionManager.tsx` (table + delivery history)
- `SubscriptionEditor.tsx` — modal form for cadence, recipients, format

## CI guard

`npm run verify:scheduled-reports` — migration, six seeds, worker, routes, Owner RBAC, manifest wiring.

## Lane lock

Do not modify `apps/backend/src/reports/ifta/**` (GAP-42 Lane A).
