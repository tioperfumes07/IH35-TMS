# GAP-32: Customer Free-Time Detention Catalog

## Scope

Lane B implementation for customer free-time detention terms as operational master data.

- No magnet files.
- No accounting/factoring behavior changes.
- Additive schema + API + UI only.

## Data Model

`mdata.customers` receives:

- `free_time_minutes INTEGER NOT NULL DEFAULT 120`
- `detention_currency TEXT NOT NULL DEFAULT 'USD'`
- `detention_requires_approval BOOLEAN NOT NULL DEFAULT true`
- `terms_updated_at TIMESTAMPTZ`
- `terms_updated_by_user_uuid UUID`

`master_data.customer_terms_history` stores pre-update snapshots:

- `customer_uuid`
- `operating_company_id`
- `tenant_id` (mirrors operating company)
- `free_time_minutes`
- `detention_rate_per_hour`
- `detention_currency`
- `detention_requires_approval`
- `terms_updated_at`
- `terms_updated_by_user_uuid`
- `recorded_at`

RLS is enforced with a customer join and `app.operating_company_id` guard.

## API

### Read current terms

- `GET /api/v1/customers/:uuid/free-time-detention`
- Query: `operating_company_id` (uuid)
- Response: `{ terms }`

### Update terms (Manager+)

- `PATCH /api/v1/customers/:uuid/free-time-detention`
- Query: `operating_company_id` (uuid)
- Body:
  - `free_time_minutes?: number`
  - `detention_rate_per_hour?: number`
  - `detention_currency?: "USD" | "MXN" | "CAD"`
  - `detention_requires_approval?: boolean`
- Behavior: write audit snapshot to `master_data.customer_terms_history` before updating `mdata.customers`.

### Read terms history

- `GET /api/v1/customers/:uuid/terms-history`
- Query:
  - `operating_company_id` (uuid)
  - `limit` (1..200, default 50)
- Response: `{ rows }`

## UI

Billing tab in `CustomerDetail` mounts `FreeTimeDetentionEditor`:

- Edit current free-time/detention terms
- Persist via PATCH endpoint
- Show terms history list

## Verification Gate

- Script: `scripts/verify-customer-free-time-catalog.mjs`
- Package script: `verify:customer-free-time-catalog`
- CI step added to run the gate
