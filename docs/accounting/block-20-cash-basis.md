# Block-20.1 Cash-Basis Foundation

## Scope

This cut adds only the cash-basis foundation:

- backend basis-toggle contract (`?basis=cash|accrual`) for Block-13/14/17 report endpoints
- pure transformation engine (`cash-basis/engine.ts`)
- closed-period snapshot lock table (`accounting.period_cash_basis_snapshot`)
- deterministic CI guards and unit tests

Frontend toggle exposure and broader report wiring remain follow-up work.

## Basis Toggle Contract (Piece 0)

Accepted query parameter contract:

- `GET /api/v1/accounting/balance-sheet?basis=cash|accrual`
- `GET /api/v1/accounting/trial-balance?basis=cash|accrual`
- `GET /api/v1/accounting/cash-flow?basis=cash|accrual` (accepted but intentionally ignored; accrual output)
- `GET /api/v1/accounting/ar-aging?basis=cash|accrual` (accepted but intentionally ignored; accrual output)
- `GET /api/v1/accounting/ap-aging?basis=cash|accrual` (accepted but intentionally ignored; accrual output)
- `GET /api/v1/reports/ifta-status?basis=cash|accrual` (accepted but intentionally ignored; accrual output)

Default is `accrual` when omitted.

## Locked Decisions (CPA/bookkeeper sign-off 2026-05-23)

| Decision | Lock |
| --- | --- |
| Q1 | Factoring follows Option A policy. |
| Q2 | Balance Sheet cash mode uses one equity adjustment line (`Cash Basis Adjustment`). |
| Q3 | Trial Balance cash mode keeps AR/AP rows visible and zeroed. |
| Q4 | AR/AP aging remain accrual-only outputs. |
| Q5 | Driver settlements recognize on bank settlement date in cash mode. |
| Q6 | Refunds show as separate expense line (not negative revenue). |
| Q7 | Basis default is accrual (no per-user memory). |
| Q8 | IFTA remains accrual only. |
| Q9 | Closed periods lock via snapshot reuse. |
| Q10 | Direct JEs pass through both bases. |
| Q11 | Tenant-scoped transforms are deterministic and pure. |
| Q12 | Foundation-only cut; frontend wiring deferred. |

Validation companions (`VQ1..VQ9`) and inventory note (`INVQ9`) are encoded in `LOCKED_DECISIONS` and covered by `engine.test.ts`.

## Engine API

`apps/backend/src/accounting/cash-basis/engine.ts` exports:

- `applyCashBasisSuppression(entries, opts)`  
  Pure deterministic function that applies cash-basis suppression and reclassification rules to in-memory entries.
- `computeCashBasisAdjustment(balanceSheetLike)`  
  Computes a single balancing equity line for cash-basis Balance Sheet output.

No DB/network/clock access is permitted in this module.

## Closed-Period Snapshot Locking (Piece C)

New table: `accounting.period_cash_basis_snapshot`

- key: `(operating_company_id, period_id)` unique
- payload: `snapshot_payload jsonb`
- metadata: `computed_at`, `computed_by_user_uuid`

Runtime behavior:

1. cash-basis report request checks whether requested anchor date is in a `closed` accounting period
2. if closed and cached report exists in snapshot payload, return cached payload
3. if closed and not cached, compute once, then upsert snapshot payload and metadata

## Validation Assets

- authoritative workbook copied to `docs/specs/block-20/BLOCK_20_VALIDATION_WORKBOOK.xlsx`
- deterministic guard: `scripts/verify-cash-basis-engine-determinism.mjs`
- snapshot shape guard: `scripts/verify-period-cash-basis-snapshot-shape.mjs`
- unit tests: `apps/backend/src/accounting/cash-basis/__tests__/engine.test.ts`
