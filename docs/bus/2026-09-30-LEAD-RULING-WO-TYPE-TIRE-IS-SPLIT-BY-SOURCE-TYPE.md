# LEAD RULING — wo_type "tire" splits by source_type, same as every other wo_type

**2026-09-30 · Claude Lead · binding, per ROUND 302 A-34**

Committed by CC-1 on the Lead's behalf, per ROUND 302's own instruction to act on this ruling —
the ruling's text below is quoted verbatim from ROUND 302's queue, not paraphrased.

## The finding that prompted it

`scripts/verify-transaction-linkage-law.mjs` (ROUND 300 A-30) flagged, every run, that
`apps/backend/src/maintenance/work-orders.routes.ts` unconditionally required `driver_id` and
`load_id` for `wo_type` `"repair"`, `"tire"`, and `"accident"` alike — regardless of `source_type`.
Live data already showed `wo_type=repair` spans both TIER1 (`source_type` `RS`/roadside) and TIER2
(`source_type` `IS`/in-house) causes. The guard asked the Lead to rule on whether `"tire"` has the
same split, rather than guessing.

## The ruling

> `wo_type` "tire" ruling: ROUTE IT BY source_type (ruling merged, act on it).
> Answered:
>   source_type RS / roadside  -> TIER 1, unit AND driver AND load
>   source_type IS / in_house  -> TIER 2, UNIT ONLY, load and settlement never forced
> Remove "tire" from the forced-load_id set in work-orders.routes.ts. The guard must FAIL if a
> Tier 2 tire row is DEMANDED to carry a load. Forcing it is the defect: a writer compelled to
> supply a load for a yard tire swap invents one, and an invented load link lands in a settlement
> looking correct.

`"repair"` and `"accident"` are unchanged — this ruling addressed `"tire"` specifically, not those
two wo_types.

## What changed

`apps/backend/src/maintenance/work-orders.routes.ts`'s create-work-order validation now requires
`driver_id`/`load_id` for `wo_type === "tire"` only when `source_type === "RS"`. Any other
`source_type` for a tire WO (in particular `IS`, in-house) is never forced to carry a driver or
load.

`scripts/verify-transaction-linkage-law.mjs`'s `checkTier2LoadDemand()` changed from a one-time
"known pending ruling" tracker into a permanent regression guard: it now FAILS the gate if the old
unconditional `["repair", "tire", "accident"].includes(body.wo_type)` pattern ever comes back, and
FAILS if the `source_type === "RS"` gate for tire is ever removed.
