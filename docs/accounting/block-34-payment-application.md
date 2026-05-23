# Block-34 Payment Application

## Scope

Block-34 introduces a dedicated payment application engine for deterministic payment allocation across AR/AP targets, with tenant scoping and overpayment handling baked into the service layer.

## What was implemented

- Added `apps/backend/src/accounting/payments/apply.service.ts` as the canonical application engine.
  - Supports `invoice` and `bill` application targets.
  - Enforces tenant scope via `set_config('app.operating_company_id', ...)`.
  - Prevents over-application beyond `payments.amount_unapplied_cents`.
  - Implements idempotent target-level replays (same target + amount becomes no-op).
  - Calls posting engine for `customer_payment` posting continuity.
  - Auto-creates AR credit memo when unapplied overpayment remains after invoice applications.
- Updated `apps/backend/src/accounting/payment-applications.routes.ts` to delegate application writes to `apply.service.ts`.
- Added migration `db/migrations/0222_block_34_payment_application_engine.sql`.
  - Extended `accounting.payment_applications` with:
    - `target_kind`
    - `target_id`
    - `amount_applied`
    - `applied_by_user_uuid`
  - Relaxed `invoice_id` to nullable and added target-shape constraints.
  - Added `accounting.vendor_credits` table for AP-side overpayment tracking.
- Added frontend modal extraction in `apps/frontend/src/pages/accounting/PaymentApplyModal.tsx` and wired `PaymentDetailPage` to use it.

## CI and tests

- Added guards:
  - `scripts/verify-payment-application-no-overpay.mjs`
  - `scripts/verify-payment-application-tenant-chain.mjs`
- Wired both guards into `scripts/verify-architectural-design.ts`.
- Added Vitest coverage:
  - `apps/backend/src/accounting/payments/__tests__/apply-tenant-isolation.test.ts`
  - `apps/backend/src/accounting/payments/__tests__/apply-overpayment.test.ts`
  - `apps/backend/src/accounting/payments/__tests__/apply-idempotent.test.ts`

## Deploy order

DEPLOY ORDER: merge after Block-33. Block-34 enables payment application guarantees consumed by subsequent reconciliation and role-mapping blocks.
