# INS-COVERAGE — assets-vs-units coverage-gap diagnosis (2026-06-21)

**Item:** LANE-A FINISH-OPS #22 (INS-COVERAGE-ASSETS-VS-UNITS), design-first, non-financial.
**Status:** DIAGNOSED. Fix is a **read-only query rewrite** (no migration) once one business rule is
confirmed by Jorge/GUARD. Not auto-applied yet — see "Why not a blind fix."

## Symptom
Fleet has ~87 units but `mdata.assets` has ~43 rows, so the insurance coverage-gap count shows a
silent "no gap" for the ~44 units that have no `mdata.assets` row — they are never evaluated.

## Root cause — population mismatch, NOT a uuid mismatch
`mdata.assets` is a **separate, partial table** from `mdata.units`. They are linked by
`assets.unit_code = units.unit_number` (a string code), **not** by id. This is already documented in
the codebase:

- `apps/backend/src/insurance/policy.routes.ts:740-751` — "Resolve the asset by EITHER an
  `mdata.assets.id` OR an `mdata.units.id`. The fleet/insurance UI passes `unit.id`, but `mdata.assets`
  has its own PK and links to units only by `unit_code = u.unit_number`."

The coverage-gap computation reads **only `mdata.assets`**:

- `apps/backend/src/insurance/summary.routes.ts:64-72` — `coverage_gap_count` =
  `SELECT count(*) FROM mdata.assets a WHERE NOT EXISTS (active policy_unit for a.id)`.
- `apps/backend/src/insurance/coverage-gap.service.ts:88-137` — `detectAssetCoverageGap` resolves a
  single `assetId` against `mdata.assets`, then checks `insurance.policy_unit.asset_id`.

So the **denominator is the 43-row `mdata.assets` mirror**, not the 87-row authoritative
`mdata.units` fleet. Any unit without a matching `mdata.assets` row (by `unit_code = unit_number`) is
invisible to the gap detector → it cannot appear as "uninsured." That is the silent under-report.

This is a **population/denominator** bug, not a per-row id type mismatch — the `asset_id ↔ asset.id`
join inside the query is internally consistent; the set it runs over is just incomplete.

## Additive fix (read-only; no migration)
Compute the gap over the authoritative fleet, LEFT-JOINing assets + active policy coverage, so units
with **no asset row** and units with **an asset row but no active policy** both surface:

```sql
-- shape (pseudocode): start from mdata.units (the real fleet), not mdata.assets
SELECT count(*)::int AS count
FROM mdata.units u
LEFT JOIN mdata.assets a
  ON a.tenant_id = u.operating_company_id   -- confirm tenant column name on assets
 AND a.unit_code = u.unit_number
WHERE u.operating_company_id = $1::uuid
  AND <u requires coverage>                  -- the OPEN business rule below
  AND NOT EXISTS (
    SELECT 1 FROM insurance.policy_unit pu
    JOIN insurance.policy p ON p.id = pu.policy_id AND p.tenant_id = pu.tenant_id
    WHERE pu.asset_id = a.id AND pu.removed_at IS NULL AND p.status = 'active'
  );
```

The same widening applies to any "list uninsured units" surface that feeds the count.

## Why not a blind fix (HOLD on one business rule)
This is a **legal/insurance** surface. Changing the denominator from 43 assets to 87 units will, by
construction, raise the coverage-gap count — and if some of those 44 extra units legitimately do NOT
require their own policy (e.g. trailers covered under a blanket policy, leased units insured by the
lessee, non-revenue/company vehicles, units owned by a different entity — TRK vs TRANSP vs USMCA share
nothing), the rewrite would fire **false "uninsured" alerts** on a compliance screen. That is worse
than the current silent under-report.

**OPEN QUESTION for Jorge/GUARD (gates the fix):** which units require their own active policy?
Candidates to encode in `<u requires coverage>`:
- truck (power unit) vs trailer vs company-vehicle (`unit_class` / `kind`)
- ownership: `owner_company_id` = this entity AND not `currently_leased_to_company_id` elsewhere
- active/in-service only (exclude archived/sold/`deactivated_at`)

Once Jorge confirms the rule, the fix is a single read-only query rewrite in `summary.routes.ts`
(+ the matching list endpoint), additive, non-financial, auto-mergeable, with a CI guard asserting a
known-uninsured unit surfaces.

## GUARD live checks
1. Confirm live counts: `mdata.units` active count vs `mdata.assets` count for TRANSP
   (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`) — verify the ~87 vs ~43 split.
2. Confirm the coverage-gap widget value today (expected: low, reflecting only the 43 assets).
3. Decide the "requires coverage" rule (the open question above) so the rewrite can land.
