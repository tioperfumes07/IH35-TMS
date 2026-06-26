# FOLLOW-UP BLOCK — Real per-truck insurance cost in Per-Truck CPM  [HOLD-FOR-JORGE]

Deferred from PER-TRUCK-CPM-500-FIX. That fix degraded the CPM insurance component to **0** (permanent) so
`reports/per-truck-cpm` returns 200 after the phantom-table 500. This block wires the **real** per-truck
insurance cost. It is a **feature with decisions**, not a bug-fix — flagged for Jorge, do NOT fold into the
500-fix.

## Why it's not a rename
The CPM query assumed a unit-keyed `insurance.insurance_policy_units` + `insurance.insurance_policies` with
`annual_premium_cents` (never existed). The REAL schema (migration 0274) is **asset-keyed**:
- `insurance.policy` — `id`, `tenant_id`, **`total_premium_cents`** (policy-level total), `status`
  (`active|expired|cancelled|pending`; no `cancelled_at`), term dates.
- `insurance.policy_unit` — `policy_id`, **`asset_id → mdata.assets`** (not `unit_id`), `insured_value_cents`,
  `tenant_id`. RLS forced.

## Decisions required before building (Jorge sign-off)
1. **unit ↔ asset mapping** — confirm how `mdata.units` relates to `mdata.assets` (units carry an `asset_id`?
   a mapping view?). CPM is per-truck (unit); insurance is per-asset. Confirm the join before coding.
2. **Premium allocation rule** — a policy's `total_premium_cents` covers multiple assets. **Recommended:
   allocate by `insured_value_cents` share** (each asset's insured value ÷ the policy's total insured value).
   Alternative: even split. Owner picks.
3. **Annualization** — `total_premium_cents` is a policy total over the policy term, not an annual figure.
   Pro-rate by the policy term dates to a daily rate, then × the report's date-range days (mirroring the
   permits/maintenance CTEs). Confirm the policy term columns to use.
4. **Status filter** — exclude `status = 'cancelled'` (and likely `'expired'`); use `tenant_id` (not
   `operating_company_id`) for entity scope.

## Scope when approved
- Tier-2 (read-report change; **no GL posting**, no money movement — projections only).
- Replace the degraded insurance CTE with: `policy → policy_unit(asset) → unit`, premium allocated per the
  chosen rule, annualized over the term, status-filtered, `tenant_id`-scoped.
- Extend `per-truck-cpm-smoke.db.test.ts` to assert non-zero insurance cost when a policy/policy_unit fixture
  exists for a unit's asset.
- Entity-independence: scope strictly by `tenant_id`; never cross-entity.

## Acceptance
Per-truck CPM shows real insurance cost allocated from `insurance.policy`/`policy_unit`; the 200 smoke guard
still passes; allocation matches the chosen rule within rounding; entity-scoped.
