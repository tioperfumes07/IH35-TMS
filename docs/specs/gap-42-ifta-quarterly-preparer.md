# GAP-42 — IFTA 4-Step Quarterly Preparer + Owner-Only WF-064

## Source

- P8-IFTA Phase 8 quarterly filing workflow
- WF-064 Owner 2-step confirmation for high-risk actions
- IFTA tax rates: [IFTA tax matrix](https://www.iftach.org/taxmatrix4/) (imported via `apps/backend/src/ifta/ifta-tax-rates.json`)

## Scope

Additive tax filing preparation only. No ledger posting or financial journal entries.

### Database

`reports.ifta_filings` stores draft → review → owner_approved → filed lifecycle with JSONB `filing_data`.

Migration: `db/migrations/202606080205_ifta_filings.sql`

### Backend (`/api/v1/reports/ifta/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/prepare` | Aggregate mileage + fuel, compute jurisdiction taxes, upsert draft |
| GET | `/draft/:uuid` | Load filing draft |
| PATCH | `/draft/:uuid` | Apply mileage/fuel overrides and recalculate |
| POST | `/draft/:uuid/owner-approve` | Owner + WF-064 confirm (`APPROVE` + 5s hold) |
| POST | `/draft/:uuid/mark-filed` | Record external confirmation number (Owner only) |
| GET | `/filings` | Filing history |

Services reuse existing IFTA aggregators and tax calculator from `apps/backend/src/ifta/`.

### Frontend

Route: `/reports/ifta-preparer`

4-step wizard:

1. Mileage review (per-jurisdiction overrides)
2. Fuel review (per-jurisdiction overrides)
3. Jurisdiction tax calc preview (catalog rates)
4. Final review with ⚡ WF-064 Owner 2-step confirmation

### CI guard

`npm run verify:ifta-quarterly-preparer`

## Lane lock

Does not modify `apps/backend/src/reports/scheduled/**` (GAP-43 Lane B).
