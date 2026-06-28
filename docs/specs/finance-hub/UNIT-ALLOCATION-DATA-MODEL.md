# Unit Allocation (Shared Cost Allocation) — Data-Model Spec

**Status:** Design / Docs only. No code, no DDL executed. Mostly REUSE of the existing allocation
control; the one schema change (a CHECK extension) is defined here for Coder. BUILD-AND-HOLD.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Standard cited:** managerial cost allocation (no single GAAP posting standard — allocation is a
**sub-ledger dimension**, not a separate GL entry). Penny-exact distribution.
**Supersedes for data-model purposes:** `FH-7-UNIT-ALLOCATION-DESIGN.md` §1–§3.

---

## 0. Scope
Assign/divide a shared cost (insurance, property tax/IRP, overhead, fuel, lease) across one or many
units (trucks/trailers/assets) for per-unit cost-of-ownership + profitability. **This already exists
and is already generic** — FH-7 is generalization + one new method + a reporting rollup, NOT a new
engine. All amounts integer cents; Σ allocations = total to the cent (final unit absorbs rounding).

## 1. What already exists (REUSE — verified in repo)
- **Table** `accounting.bill_unit_allocation` (mig `0264_bill_unit_allocation.sql`), already generic:
  `id · tenant_id · bill_id · asset_id · allocation_method · allocation_pct(0–100) ·
  allocated_amount_cents`, `UNIQUE(bill_id, asset_id)`. Methods today: `equal · by_value · by_miles ·
  manual_pct`.
- **Backend** `apps/backend/src/accounting/allocation.ts` → `resolveAllocation(method, assets,
  totalCents, manualPcts?, miles?)` (penny-exact).
- **Routes** `POST /api/v1/accounting/bills/{id}/allocate` (generic).
- **Frontend** `apps/frontend/src/components/allocation/` (`BillAllocationPanel`,
  `AllocationMethodPicker`, `AllocationPreviewTable`) — already expense-agnostic.

## 2. The gap FH-7 closes (small, deliberate)
1. **Add `manual_amount`** method — exact $ per unit (must sum to total). Today there is `manual_pct`
   (by %) but not by-amount.
2. **Generalize callers** — taxes (FH-6 property tax/IRP) and lease (FH-8) reuse the same control.
3. **Per-unit reporting rollup** — "Unit 1487: insurance $X + property tax $Y + IRP $Z" across bill
   types from `bill_unit_allocation`.
4. **Editable + audited** — every edit writes `audit.row_changes`.

## 3. The only schema change (Coder migration)
Extend the method CHECK constraint to allow `manual_amount`:
```sql
-- Idempotent: drop + re-add the method CHECK to include 'manual_amount'.
ALTER TABLE accounting.bill_unit_allocation
  DROP CONSTRAINT IF EXISTS bill_unit_allocation_allocation_method_check;
ALTER TABLE accounting.bill_unit_allocation
  ADD CONSTRAINT bill_unit_allocation_allocation_method_check
  CHECK (allocation_method IN ('equal','by_value','by_miles','manual_pct','manual_amount'));
```
> No new table. RLS/grants already exist on `accounting.bill_unit_allocation` — do not duplicate them.
> If the live constraint name differs, Coder confirms it via `\d accounting.bill_unit_allocation`
> against the fresh-migrated DB before writing the migration (verify-first).

## 4. Allocation methods (after FH-7)
| Method | Behavior |
|---|---|
| `equal` | split evenly across selected units |
| `manual_pct` | enter a % per unit (must sum to 100) |
| **`manual_amount`** *(new)* | enter exact $ per unit (must sum to the total) |
| `by_value` | weighted by each unit's insured/asset value |
| `by_miles` | weighted by each unit's period miles |

## 5. Posting semantics (NO separate JE)
Allocating a bill writes `bill_unit_allocation` rows; the parent bill posts to the GL as usual and the
allocation is a **sub-ledger dimension** on that expense (tags cost to units; does NOT double-post).
**Sample (not a JE):** a $1,200.00 insurance bill across 4 units, `equal` →
4 rows: `allocated_amount_cents = 30000` each; Σ = 120000 = bill total. Edits re-resolve (preview-first)
and re-write rows; old values audited.

## 6. Acceptance
`manual_amount` added to engine + method picker + CHECK; callers generalized (taxes, lease) reuse the
one control; per-unit rollup reads across bill types; edits audited; penny-exact Σ = total; existing
insurance behavior unchanged (GUARD verifies the generalization is non-breaking).

## 7. DO NOT
- DO NOT build a second allocation system or a parallel table (reuse `bill_unit_allocation`).
- DO NOT post a separate allocation JE (sub-ledger dimension only).
- DO NOT change existing insurance behavior. DO NOT cross entities (per-entity tenant scope).
