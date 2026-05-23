# Block-40: Accounting audit trail

## Scope

Block-40 introduces an accounting-only, tenant-scoped audit trail focused on immutable posting evidence and deterministic source lineage.

## What shipped

- Added backend routes:
  - `GET /api/v1/accounting/audit-trail`
  - `GET /api/v1/accounting/audit-trail/source-lineage`
- Added backend service over posting backbone tables:
  - `accounting.journal_entry_postings`
  - `accounting.journal_entries`
  - `accounting.posting_batches`
  - `accounting.transaction_source_links`
- Added frontend page:
  - `/accounting/audit-trail`
  - Filterable event stream with before/after JSON for posting-line transitions
  - On-demand source lineage drilldown from audit rows
- Added frontend API contracts for audit trail and lineage lookups.
- Added CI guards:
  - `verify-accounting-audit-trail-tenant-scope.mjs`
  - `verify-accounting-audit-trail-lineage.mjs`

## Design notes

- Audit rows are emitted from immutable posting records, not mutable operational entities.
- Every query is constrained by `operating_company_id` and executed through `withCompanyScope`.
- Source lineage requires both `source_transaction_type` and `source_transaction_id` to avoid broad scans.

## Verification

- `npm run build:backend`
- `cd apps/frontend && npx tsc -b`
- `npm run verify:arch-design`
- `npx vitest run apps/backend/src/accounting/audit-trail/__tests__/service-tenant-scope.test.ts apps/backend/src/accounting/audit-trail/__tests__/source-lineage-filters.test.ts`
