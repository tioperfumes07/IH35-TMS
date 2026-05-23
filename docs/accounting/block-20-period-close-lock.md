# Block-20.3 Period Close Lock

## Purpose

Implements locked decision Q9: cash-basis numbers lock at period close and are not recomputed for closed periods.

## Close-Time Snapshot

At `/api/v1/accounting/periods/:id/close`:

1. Build accrual statement payloads for the period:
   - Profit & Loss (period start/end)
   - Trial Balance (period start/end)
   - Balance Sheet (as of period end)
2. Apply the cash-basis transformation engine.
3. Insert one immutable row in `accounting.period_cash_basis_snapshot` keyed by `(operating_company_id, period_id)`.
4. Continue normal period close behavior (status -> `closed`, retained earnings close JE behavior unchanged).

## Read-Side Resolution

For `?basis=cash` on Balance Sheet, Trial Balance, and Profit & Loss:

- If anchor date resolves to a closed period:
  - return `snapshot_payload.reports.*` for that statement
  - do not recompute live values
- If anchor date resolves to an open period:
  - compute live cash-basis using engine transforms

For `?basis=accrual`, existing live behavior remains unchanged.

## Runtime Lock + Guard

Defense in depth:

- DB trigger (`BEFORE UPDATE OR DELETE`) rejects post-close snapshot mutation with `IH35_CASH_BASIS_SNAPSHOT_LOCKED`.
- Policy explicitly removes service-role bypass on this table.
- Static guard `scripts/verify-period-cash-basis-snapshot-readonly.mjs` fails if write paths appear outside close-time writer.

## Manual Invalidation Policy

No API supports snapshot mutation or invalidation.

Any manual DB-level invalidation requires explicit operator approval and full audit trail outside application routes.
