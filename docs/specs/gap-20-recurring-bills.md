# GAP-20 — Recurring Bills (QBO Parity)

## Problem

Operators must manually create the same bill every month for recurring expenses:
- Insurance premiums (Wells Fargo escrow)
- Office rent
- Software subscriptions (QBO, Samsara, Relay)
- Loan payments
- Recurring vendor retainers

QBO supports recurring bills natively; TMS does not. Manual re-entry causes human error and missed bills.

## Solution

A dedicated recurring bill template system with:
1. **`accounting.recurring_bill_templates`** — stores the template (vendor, amount, frequency, schedule)
2. **`accounting.recurring_bill_generation_log`** — immutable audit log of every bill generation attempt
3. **Template service** — CRUD with deactivation-only (never delete)
4. **Generator service** — creates `accounting.bills` from templates, advances `next_generation_date`, optionally auto-posts via the Block-7 posting engine
5. **Daily worker** — runs at 06:00 CT, processes all due templates
6. **REST routes** — full CRUD + manual trigger
7. **Frontend** — Recurring tab on Bills page, template list + create form

## Schema

### `accounting.recurring_bill_templates`

| Column | Type | Description |
|---|---|---|
| `uuid` | UUID PK | Template identifier |
| `operating_company_id` | TEXT | Tenant scope |
| `vendor_uuid` | UUID | Linked vendor |
| `template_name` | TEXT | Human-readable name |
| `amount` | NUMERIC(12,2) | Bill amount in dollars |
| `memo` | TEXT | Optional memo on generated bill |
| `frequency` | TEXT | `weekly\|biweekly\|monthly\|quarterly\|annually` |
| `day_of_month` | INTEGER | For monthly anchoring (optional) |
| `day_of_week` | INTEGER | For weekly anchoring (optional) |
| `next_generation_date` | DATE | Date worker will next generate from this template |
| `end_date` | DATE | Optional — stop generating after this date |
| `is_active` | BOOLEAN | False = deactivated (never deleted) |
| `auto_post` | BOOLEAN | If true, auto-post via posting engine after creation |
| `line_items` | JSONB | Array of `{description, amount, coa_account_id}` |

### `accounting.recurring_bill_generation_log`

| Column | Type | Description |
|---|---|---|
| `uuid` | UUID PK | Log entry identifier |
| `template_uuid` | UUID FK | Linked template |
| `generated_bill_uuid` | UUID | ID of the created bill (null on failure) |
| `generated_at` | TIMESTAMPTZ | When generation ran |
| `status` | TEXT | `success\|failed` |
| `error_message` | TEXT | Failure reason (null on success) |

## API Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/accounting/recurring-bills/templates` | Create template (requires `Idempotency-Key`) |
| `GET` | `/api/accounting/recurring-bills/templates` | List templates |
| `GET` | `/api/accounting/recurring-bills/templates/:uuid` | Get single template |
| `PATCH` | `/api/accounting/recurring-bills/templates/:uuid` | Update template |
| `PATCH` | `/api/accounting/recurring-bills/templates/:uuid/deactivate` | Deactivate (additive-only) |
| `POST` | `/api/accounting/recurring-bills/templates/:uuid/generate-now` | Manual trigger (requires `Idempotency-Key`) |
| `GET` | `/api/accounting/recurring-bills/generation-log` | List generation log |

## Worker

`apps/backend/src/jobs/recurring-bill-generator-worker.ts`

- Runs daily at **06:00 CT** using `setTimeout` scheduled to next occurrence
- Calls `runRecurringBillGeneratorTick()` which processes all templates with `next_generation_date <= today`
- Each generated bill: creates `accounting.bills` row via `createBill()`, updates `next_generation_date`, writes to `generation_log`
- If `auto_post=true`: calls `postSourceTransaction()` on the new bill (failure is logged but doesn't fail the generation)

## Frequency → Next Date Calculation

| Frequency | Advance |
|---|---|
| `weekly` | +7 days |
| `biweekly` | +14 days |
| `monthly` | +1 calendar month (Luxon) |
| `quarterly` | +3 months |
| `annually` | +1 year |

Month-end dates use Luxon calendar math (Jan 31 + 1 month = Feb 28/29).

## Design Constraints

- **Additive only** — templates are never deleted, only deactivated (`is_active = false`)
- **No new financial code** — uses existing `createBill()` and `postSourceTransaction()`
- **`Idempotency-Key` required** on all POSTs that create financial records
- **RLS-scoped** on `operating_company_id`
- **`ih35_app` role** — all grants use `ih35_app`, not `app_user`

## CI Guard

`scripts/verify-recurring-bills.mjs` — validates:
- Migration applied with correct table names, grants, RLS
- All service exports present
- No `DELETE FROM accounting.recurring_bill_templates` anywhere
- Worker registered in `index.ts`
- Frontend components and Recurring tab present

## Post-Merge

Integrates with QBO mirror so recurring bill templates sync to QBO's recurring-template feature for parity.
