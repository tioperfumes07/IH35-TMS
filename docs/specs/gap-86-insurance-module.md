# GAP-86 — Insurance Policies + Claims Module (Block 5)

## Summary

Block 5 adds multi-vehicle insurance policy creation with automatic bill schedule generation to the existing `insurance` schema.

## What's Already There (pre-Block 5)

The `insurance` schema was built in earlier blocks and includes:

| Table | Purpose |
|-------|---------|
| `insurance.policy` | Policy header: insurer, dates, premium, installments |
| `insurance.policy_unit` | Many-to-many: policy ↔ fleet asset |
| `insurance.payment_schedule` | Per-installment due dates + amounts |
| `insurance.type_catalog` | Coverage types seeded per tenant |
| `insurance.claim` | Claim tracking |
| `insurance.lawsuit` | Litigation tracking |
| `insurance.coi` | Certificate of Insurance tracking |

## What Block 5 Adds

### Migration `202606071800_insurance_bill_schedule_link.sql`

- Adds `vendor_id TEXT NULL` to `insurance.policy` — links the insurance carrier to an `accounting` vendor row
- Adds `bill_uuid UUID NULL REFERENCES accounting.bills(id)` to `insurance.payment_schedule` — back-link from each installment to the accounting bill

### Backend: `policy-bill-schedule.service.ts`

`createPolicyBillSchedule(policyId, userId, client)` is called after a policy is inserted when:
- `installment_count > 0`
- `vendor_id` is set

For each installment it:
1. Computes the due date: `effective_date + N months`, day-clamped to `due_day`
2. Splits `(total_premium_cents - down_payment_cents)` evenly, adding any cent remainder to installment #1
3. Calls the **canonical** `createBill()` from `apps/backend/src/accounting/bills.service.ts:483` — NO new financial code
4. Inserts an `insurance.payment_schedule` row with `bill_uuid` pointing to the created bill

### Backend: `policy.routes.ts` changes

`POST /api/v1/insurance/policies` now accepts `vendor_id` (optional TEXT).

If `vendor_id` + `installment_count > 0`, the route fires `createPolicyBillSchedule()` after policy commit. Bill-schedule failure is **non-fatal**: the policy is already committed and a `X-Bill-Schedule-Warning: bill_schedule_failed` header is returned so the caller can retry.

`PATCH /api/v1/insurance/policies/:id` also accepts `vendor_id` to let operators set or update the carrier vendor link.

### Frontend: `PolicyCreateModal.tsx`

- Fetches `GET /api/v1/accounting/vendors` to populate a vendor dropdown
- New **Accounting Vendor** field (optional) shown between *Agent Contact* and *Covered Units*
- When vendor + installment count > 0, shows a green hint: "N bill(s) will be created in Accounting when the policy is saved."
- Multi-vehicle selection (unit checkboxes) was already implemented; unchanged

## Financial Rule

> **MUST call existing `createBill()` from `apps/backend/src/accounting/bills.service.ts:483`.**  
> **NO new financial code.**

`createBill()` handles the QBO outbox push and journal-entry creation automatically.

## CI Guard

`scripts/verify-insurance-module.mjs` verifies:
1. Migration exists with `vendor_id` and `bill_uuid` columns
2. `policy-bill-schedule.service.ts` calls `createBill()` and persists `bill_uuid`
3. `policy.routes.ts` wires `vendor_id` and calls `createPolicyBillSchedule`
4. `PolicyCreateModal.tsx` has vendor picker and passes `vendor_id`
5. `insurance.ts` API type includes `vendor_id`
6. Block manifest references GAP-86 and the financial rule

Run: `node scripts/verify-insurance-module.mjs`

## Acceptance Criteria

- [ ] Migration `202606071800_insurance_bill_schedule_link.sql` applied
- [ ] `POST /api/v1/insurance/policies` with `vendor_id` + `installment_count: 3` creates 3 `accounting.bills` rows
- [ ] Each bill is linked back via `insurance.payment_schedule.bill_uuid`
- [ ] `PolicyCreateModal` shows vendor dropdown + "N bill(s) will be created" hint
- [ ] `verify-insurance-module.mjs` exits 0
- [ ] `build:backend`, `frontend tsc -b`, `vitest` all pass

## Forward-fix (post-#687) — double-bill vulnerability remediation

#687 shipped the creator but left a double-bill hole: `POST /api/v1/insurance/policies`
was not in the idempotency `REQUIRED_MATCHERS`, the schedule fired post-commit with a
silent non-fatal swallow (`X-Bill-Schedule-Warning`), there was no replay-skip, and the
down payment was not billed. This fix is additive (keeps `bill_uuid` + `vendor_id`):

- **Idempotency:** `^/api/v1/insurance/policies(/|$)` added to `REQUIRED_MATCHERS`
  (`middleware/idempotency.ts`) — a retry/double-click replays the cached response,
  so no duplicate policy + duplicate vendor bills.
- **Belt-and-suspenders:** partial `UNIQUE` index on `insurance.payment_schedule(bill_uuid)`
  (`db/migrations/202606072100_…`) — a bill can never be linked twice.
- **Replay-skip:** `createPolicyBillSchedule` no-ops if the policy already has any
  `bill_uuid`-linked row.
- **Atomic / hard-fail:** the schedule is generated **inside the policy transaction**;
  any failure rolls the policy back and returns `502` (the `X-Bill-Schedule-Warning`
  path is removed). Pre-flight validation (vendor resolvable + amounts sane) runs before
  the first `createBill()` so a mid-loop failure is near-impossible. If a bill was already
  committed when a later step fails, it is voided via `voidBill()`; any that cannot be
  voided raise a **CRITICAL Sentry alert** listing the orphaned bill ids (never silent).
- **Down payment billed:** when `down_payment_cents > 0`, a first `INS-<policy>-DP` bill is
  created so `down_payment + Σ installments === total_premium`.
