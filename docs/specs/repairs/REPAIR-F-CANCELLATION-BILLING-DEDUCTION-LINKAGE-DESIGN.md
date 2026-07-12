# REPAIR F — Cancellation → billing / driver-deduction linkage (DESIGN)
2026-07-11 · financial-cluster §1.4 (migration + posting) · DESIGN DOC ONLY. Owner sign-off gate.
Author: agent (design only — NO code, NO SQL applied, NO posting logic built). Flags default OFF.

## Scope — the SPEC:NONE biz-flow-3 cluster
This design unblocks the five load-cancellation money-flow blocks that the MASTER-MANIFEST
(`docs/trackers/MASTER-MANIFEST-2026-07-10.json`) marks `not-built` / `partial` with `SPEC: NONE`
("needs a design doc before this can become a build block"):

| Block id | Manifest verdict | What it asks for |
|---|---|---|
| `biz-flow-3-no-auto-customer-charge-on-cancellation` | not-built | auto-create a customer charge from `cancellation_charge_cents` |
| `biz-flow-3-no-cancellation-billing-linkage` | not-built | FK `dispatch.load_cancellations` → the invoice/charge it produced |
| `biz-flow-3-no-auto-escrow-deduction-driver-fault-cancellation` | not-built | auto-create an escrow deduction when the reason is driver-fault |
| `biz-flow-3-no-cancellation-deduction-linkage` | not-built | FK `dispatch.load_cancellations` → the driver deduction it produced |
| `biz-flow-3-approval-workflow-no-downstream-actions` | partial | approval event triggers no billing/deduction |

Sibling designs already exist and are the authority for the pieces they cover — this doc does NOT
duplicate them, it wires the cancellation event into them:
- **REPAIR-A** (`REPAIR-A-DEDUCTION-LEDGER-DESIGN.md`) — the canonical `driver_finance.*` deduction
  ledger + pay-first-then-escrow applier. The driver-deduction leg here is a **new source** feeding
  REPAIR-A's ledger, not a new engine.
- **REPAIR-D** (`REPAIR-D-CONDUCT-CATALOG-DESIGN.md`) — the shared driver-conduct catalog and the
  single-financial-consequence rule; "driver fault" on a cancellation resolves through REPAIR-D's
  `conduct_reason_id`, not a second fault vocabulary.

## Verified current state (2026-07-11, against repo; prod DDL UNVERIFIED — needs owner live check)
`apps/backend/src/dispatch/cancellation.service.ts` (read this session):
- `cancelLoad()` INSERTs `dispatch.load_cancellations` (`billable_to_customer`, `cancellation_charge_cents`,
  `status` ∈ `requested|approved`) then flips `mdata.loads.status='cancelled'`. `approveCancellation()`
  (Owner-only) sets `status='approved'` + flips the load. **Zero** invoice / escrow / deduction calls in
  either path (grep confirmed: no `invoice`, no `escrow`, no `createSettlementDeduction`).
- Reason catalog is **`catalogs.cancellation_reasons`** (canonical per LINKAGE-LAW §10b —
  NOT the RETIRE `catalogs.load_cancellation_reasons`), keyed by `reason_code`, carrying
  `billable_to_customer_default`, `requires_owner_approval`.
- `dispatch.load_cancellations` today has `reason_code` + (per migration review) `reason_code_id`;
  it has **no** `billed_invoice_id` and **no** `driver_deduction_id` column.

## Design

### A. Linkage columns (additive migration — owner ceremony)
Add to `dispatch.load_cancellations`, both **nullable**, both FK to the CANONICAL producer:
1. `billed_invoice_id uuid NULL REFERENCES accounting.invoices(id)` — the customer charge this
   cancellation produced (biz-flow-3-no-cancellation-billing-linkage).
2. `driver_deduction_id uuid NULL REFERENCES driver_finance.driver_settlement_deductions(id)` — the
   driver-recovery deduction this cancellation produced (biz-flow-3-no-cancellation-deduction-linkage).
   (`driver_finance.*` is canonical; `payroll.*` is RETIRE — never FK the RETIRE side.)
FKs added `NOT VALID` (safe against pre-existing rows; VALIDATE on Neon during ceremony), idempotent
(`pg_constraint` guard), FORCE-RLS already inherited by the table. **Additive only — no column reorder.**

### B. Customer-charge leg (flag `CANCELLATION_AUTO_CHARGE_ENABLED`, default OFF)
On approval, when `billable_to_customer=true` AND `cancellation_charge_cents > 0`:
- create ONE `accounting.invoices` + `accounting.invoice_lines` row for the cancellation fee, using the
  **existing** invoice-build infra (`buildInvoiceFromLoad` / the posting-engine `invoice` source type) —
  **no new GL math** (§2). Stamp `dispatch.load_cancellations.billed_invoice_id`.
- Customer + operating_company come from the load; entity-scope every read (`operating_company_id`),
  loads scoped by `id`/opco, never a bare `mdata.*` literal.
- Idempotent on `load_cancellations.id` (a second approve must not double-bill).

### C. Driver-fault escrow / deduction leg (flag `CANCELLATION_DRIVER_RECOVERY_ENABLED`, default OFF)
When the cancellation's reason maps (via REPAIR-D `conduct_reason_id`) to `is_separation_cause`/driver-fault
AND `is_escrow_eligible`:
- create ONE recovery through **REPAIR-A's canonical `driver_finance` ledger** (pay-first-then-escrow —
  the SINGLE financial consequence rule from REPAIR-D decision D; never a second parallel charge). Stamp
  `dispatch.load_cancellations.driver_deduction_id`.
- **Escrow is a LIABILITY** (auto-memory `driver-escrow-is-liability`). The driver is a Mexican-B1 **1099
  contractor** — a cancellation recovery is a fee/deduction, **never** a %-of-linehaul clawback.

### D. Approval wiring (biz-flow-3-approval-workflow-no-downstream-actions)
`approveCancellation()` becomes the single trigger point that (behind the two OFF flags) fires B and C
inside the SAME transaction as the `status='approved'` write, each idempotent and each stamping its FK
back onto the cancellation row (forward + reverse linkage, LINKAGE-LAW Clause 3).

## Non-negotiables (why this stays a design doc)
- §1.4: an agent **never** builds posting/GL/escrow-liability logic solo and **never** applies the
  migration. This doc is the design; the owner runs the DDL + flips flags.
- Reuse existing posting/allocation infra — write NO new GL math (§2).
- void-not-delete; append-only audit; UUIDv7 PKs; `security_invoker` views; FORCE-RLS + grants on any
  new object (0065 pattern) or it 500s at runtime.

## CI guards / rollout (proposed — built with the code, not before)
- `verify-cancellation-linkage-fks` — asserts both FKs exist, point at CANONICAL tables, `NOT VALID`,
  idempotent.
- `verify-cancellation-charge-idempotent` — one invoice per cancellation id.
- `verify-cancellation-recovery-single-consequence` — the driver leg routes through REPAIR-A's ledger
  only (no second parallel charge), reusing REPAIR-D's `verify-single-financial-consequence`.
- Neon test branch: approve a billable driver-fault cancellation → exactly one invoice (FK stamped),
  exactly one canonical deduction (FK stamped), books balance, 0 orphans. Owner sign-off before any DDL
  and before either flag is flipped.
