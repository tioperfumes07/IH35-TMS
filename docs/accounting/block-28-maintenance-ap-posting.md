# Block-28: Maintenance AP posting

Task ID: Block-28  
Branch: `feat/block-28-maintenance-ap-posting`  
Depends on: Block-21 resolver + cut-6 bill push chain + Block-32 bill line account wiring.

## Why

Maintenance is a high-volume operating cost. Closed work orders should produce AP bills with deterministic line-account resolution so costs are both payable and ledger-posted.

## Piece 0 investigation notes

1. **Work order schema + parts/labor lines**
   - Canonical header table: `maintenance.work_orders`.
   - Canonical detail lines: `maintenance.work_order_lines` with `line_type` including `parts`/`labor` and two-section metadata (`section`, service/part/labor references).
   - Existing close paths already transition `work_orders.status` to `complete`.

2. **Maintenance category mapping used in Block-28**
   - `tires`, `brakes`, `engine`, `dot`, `pm_preventive`, `body`, `electrical`, `ac`, `misc`.
   - Category is inferred from work-order + line description context and resolved through:
     `resolveAccountForCategory(operating_company_id, "maintenance", categoryCode)`.

3. **Vendor linkage on work orders**
   - Work orders carry vendor references (`vendor_id`, `external_vendor_id`).
   - AP bill creation uses whichever vendor key is present and links bill back via `linked_work_order_uuid`.

## Piece A implementation: bill auto-creation on close

Added `apps/backend/src/accounting/maintenance-posting/poster.service.ts`:

- `processMaintenanceWorkOrderClose(...)`
  - Runs only when work order is in a closed status.
  - Reuses existing linked bill when present; otherwise creates a bill.
  - Pulls parts/labor work-order lines and writes `accounting.bill_lines`.
  - Resolves line account via Block-21 resolver for each line.
  - Recalculates bill totals and enqueues cut-6 bill push outbox event.

Route hooks added:

- `apps/backend/src/maintenance/work-orders.routes.ts`
  - `/api/v1/maintenance/work-orders/:id/complete`
  - `/api/v1/maintenance/work-orders/:id/transition` (when transitioned into closed states)
- `apps/backend/src/work-orders/work-orders.routes.ts`
  - `/api/v1/work-orders/:id/complete`

## Piece B implementation: posting engine hook

- After bill creation/reuse, Block-28 invokes posting backbone:
  - `postSourceTransaction({ source_transaction_type: "bill", source_transaction_id: bill_id, ... })`
- Result is treated idempotently (`posted` or `already_posted`).

## Piece C implementation: guard + tests

Added guard:

- `scripts/verify-maintenance-posting-uses-resolver.mjs`
  - Ensures maintenance posting imports/uses Block-21 resolver.
  - Ensures bill is posted via posting backbone hook.

Wired guard into:

- `scripts/verify-architectural-design.ts`

Added tests:

- `apps/backend/src/accounting/maintenance-posting/__tests__/poster-tenant-isolation.test.ts`
- `apps/backend/src/accounting/maintenance-posting/__tests__/poster-work-order-to-bill.test.ts`
- `apps/backend/src/accounting/maintenance-posting/__tests__/poster-multi-line-bill.test.ts`

## Deploy ordering note

DEPLOY ORDER: merge after Block-21 + Block-32.
