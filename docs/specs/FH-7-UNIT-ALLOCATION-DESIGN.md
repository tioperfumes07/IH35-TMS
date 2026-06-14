# FH-7 — Unit Allocation control (shared, cross-cutting) — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). FINANCE/cross-cutting block — **REUSE the existing insurance allocation pattern, do not reinvent.** Built gated where it posts; GUARD verifies; designed live with Jorge.
**Audience:** Jorge + GUARD.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** plumbing, but **NOT tax-only** — a shared control used by property tax, IRP, insurance, and **any multi-unit expense/bill**. Callers: FH-6 (taxes), insurance, future expense flows.
**Grounds:** the existing, **already-generalized** allocation feature in the repo (mapped below) + locked principles (audit every allocation; `is_active` + soft-delete + audit; money-adjacent gated).

---

## 0. Executive summary

Jorge: *"a unit selector… as in the insurance."* A reusable control to **assign or divide an expense/bill across one or many trucks/assets (units)** — even split, by %, or by entered amount per unit. Each split **allocates to that unit** for per-unit cost-of-ownership, profitability, and per-unit reporting. **The good news: this already exists and is already generic** — insurance is just one caller. FH-7 is mostly **generalizing the callers + adding the "by entered amount" method + a unit-allocation reporting view**, not building from scratch.

---

## 1. What already exists (REUSE — verified in repo)

**Frontend (already generic — `apps/frontend/src/components/allocation/`):**
- `BillAllocationPanel.tsx` — full UI: unit/asset picker checkboxes, method radio, manual %/miles inputs, preview table. Posts to `/api/v1/accounting/bills/{billId}/allocate`. **Already expense-agnostic** (not insurance-specific).
- `AllocationMethodPicker.tsx` — reusable method radio.
- `AllocationPreviewTable.tsx` — penny-exact preview/display.
- `types.ts` — `AllocationMethod`, `AllocationAssetOption`, `AllocationPreviewRow`, `AllocateBillRequest/Response`.

**Backend:**
- `apps/backend/src/accounting/allocation.ts` — **`resolveAllocation(method, assets, totalCents, manualPcts?, miles?)` → `AllocationRow[]`** — the generic math, penny-exact rounding. Used by both insurance and generic bills.
- `apps/backend/src/accounting/bills.routes.ts` — `POST /api/v1/accounting/bills/{id}/allocate` (generic, any bill).
- `apps/backend/src/insurance/policy-create-atomic.{routes,service}.ts` — the **insurance caller** (wraps the generic math for the policy wizard); not the engine.

**Data model — `accounting.bill_unit_allocation`** (mig `0264_bill_unit_allocation.sql`), already generic (no insurance FK):
```
id · tenant_id · bill_id · asset_id · allocation_method · allocation_pct(0–100) · allocated_amount_cents   UNIQUE(bill_id, asset_id)
```
Methods today: `equal · by_value · by_miles · manual_pct`. (Insurance wizard uses its own labels `equal_split/pro_rata/weighted` mapped onto the same math.)

---

## 2. The gap FH-7 closes (small, deliberate)

1. **Add `manual_amount`** method — Jorge wants **"by entered amount per unit"** (exact $ per unit, must sum to the total). Today there's `manual_pct` (by %) but not by-amount. Add it to `resolveAllocation` + the method picker + the CHECK constraint.
2. **Generalize the callers** — make **taxes (FH-6 property tax, IRP)** and any expense reuse `BillAllocationPanel` + `resolveAllocation` + `bill_unit_allocation` exactly as insurance does. **One control, many callers** — no new allocation engine.
3. **Per-unit reporting view** — surface allocations rolled up **per unit** (cost-of-ownership / profitability): "Unit 1487 — insurance $X + property tax $Y + IRP $Z this year." Reads `bill_unit_allocation` across bill types.
4. **Editable + audited** — allocations are editable; every edit writes an audit-spine row (today's flow + audit).

---

## 3. Allocation methods (after FH-7)

| Method | Behavior |
|---|---|
| `equal` | split evenly across selected units |
| `manual_pct` | enter a % per unit (must sum to 100) |
| **`manual_amount`** *(new)* | enter an exact $ per unit (must sum to the total) |
| `by_value` | weighted by each unit's insured/asset value |
| `by_miles` | weighted by each unit's period miles |

Penny-exactness preserved (the engine already guarantees Σ allocations = total to the cent; the final unit absorbs rounding).

---

## 4. Posting / allocation semantics

- Allocating a bill writes `bill_unit_allocation` rows; per-unit amounts feed **per-unit cost-of-ownership and profitability** (and FH-6 per-unit tax splits).
- Where the parent bill posts to the GL, the allocation is a **sub-ledger dimension** on that expense (not a separate JE) — it tags cost to units; it doesn't double-post. (Confirm the exact reporting join in session.)
- Edits re-resolve the split (preview-first) and re-write the rows; old values audited.

---

## 5. Open questions for Jorge

- **(a)** Confirm **`manual_amount`** (by entered $/unit) is the missing method you want added.
- **(b)** Per-unit reporting — a dedicated **"Cost of ownership per unit"** view in the Finance Hub, or surface on each unit's profile?
- **(c)** Allocation dimensions beyond units — ever by **driver** or **load**, or units only?
- **(d)** Should allocation be **required** for certain expense types (IRP/property/insurance), or always optional?

---

## 6. Build sequence (mostly generalization, low net-new)

1. Add **`manual_amount`** to `resolveAllocation` + `AllocationMethodPicker` + the `bill_unit_allocation` CHECK constraint (small migration — accept-edits).
2. Wire **`BillAllocationPanel`** into the **FH-6 taxes** flow (property tax, IRP) — new caller, existing component.
3. **Per-unit reporting** view (rollup across bill types from `bill_unit_allocation`).
4. Confirm/extend the **audit** on allocation edits.

Reuses existing components/engine/table — **do not build a second allocation system.** GUARD verifies the generalization doesn't change insurance's existing behavior.
