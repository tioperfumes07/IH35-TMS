# UNIFIED_BLUEPRINT_ADDITIONS.md — append (Insurance <-> Safety connection)

## 2026-06-07 — INSURANCE <-> SAFETY connected (coverage truth, values, gaps)

STATUS: APPROVED BY JORGE 2026-06-07. ADDITIVE ONLY. Extends the locked Insurance block.
Goal: no surprises — Safety always knows what is insured, for how much, with what deductible, and where the GAPS are.

### Shared source of truth
- insurance.policies (carrier, type, policy_number, effective, expires, total_premium, term, is_active)
- insurance.policy_units (policy_uuid -> unit_uuid, cost_per_month, effective, expires) — the link from a POLICY to each INSURED UNIT/ASSET.
- Extend policy / policy_units with PER-UNIT coverage detail (additive columns; NULL-safe):
  - coverage_types covered for that unit: liability, physical_damage (comp+collision), cargo, workers_comp (driver), other.
  - coverage_limit_amount (per coverage type), deductible_amount (per coverage type), insured_value (stated value of the unit).
  - Model as insurance.policy_unit_coverages (policy_unit_uuid, coverage_type, limit_amount, deductible_amount, insured_value) — one row per coverage type per unit. Additive table.

### Insurance module (where units are SELECTED + valued)
- In the Create-policy multi-vehicle selector (Step 2/3): per selected unit, capture/seed coverage_types, coverage_limit, deductible, insured_value.
- Policies tab + a unit's policy detail show: which coverages, limits, deductible, insured value, effective/expires.
- Coverage gaps tab: lists units/assets with MISSING or LAPSED coverage by type.

### Safety module (where coverage is VERIFIED + gaps surface)
- Safety unit/asset profile gets an INSURANCE panel (read from insurance.policy_units + policy_unit_coverages):
  - Insured? (yes/no), by which policy/carrier, coverage types held (liability / physical damage / cargo / WC),
    coverage limit per type, deductible per type, insured value, effective -> expires.
- Safety "Coverage gaps" view computes and shows gaps:
  - Unit has NO active policy_unit on the selected date -> UNINSURED gap.
  - Unit missing a required coverage type (e.g., has liability but no physical damage) -> COVERAGE-TYPE gap.
  - Policy expired / expiring <60d -> LAPSE risk.
  - Context-aware: a unit intentionally uninsured because it is STOPPED / OOS / in the shop (e.g., 3 months) is shown
    as "Uninsured — OOS/in shop since <date>" (expected, not an error) vs "Uninsured — ACTIVE unit" (real gap, alert).
    Source of unit status: master_data.units status (active / OOS / in_shop / sold / retired) + maintenance open WO.

### Connection rules (locked)
1. Selecting insured units lives in INSURANCE; SAFETY reads that selection — single source, no duplicate entry.
2. Safety NEVER writes insurance coverage; it reads + flags. Insurance owns the coverage data.
3. Coverage gap = (active unit) AND (no active policy_unit for a required coverage type on date). OOS/in-shop units are flagged separately as expected-uninsured.
4. Values (insured value, limits, deductible) entered once in Insurance, surfaced in both Insurance and Safety.
5. All reads via existing services; additive tables/columns only; audit on writes; ARCHIVE never DELETE.

### Acceptance
1. insurance.policy_unit_coverages (additive) stores coverage_type, limit, deductible, insured_value per unit per policy.
2. Insurance creator captures per-unit coverage + value + deductible.
3. Safety unit profile shows insurance panel (coverages, limits, deductible, insured value, dates).
4. Safety Coverage gaps distinguishes ACTIVE-uninsured (alert) from OOS/in-shop-uninsured (expected).
5. Nothing removed anywhere.
