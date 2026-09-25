# ROUND 173 — CC-3. Load boards identical, then the Settlement Creator. Lead, 2:47 PM CT (19:47Z).
Full order: `~/Downloads/09-25-26-handoff/orders/09-25-2026-CC-3-ROUND-173-...md`. Part 1 due
09-26 01:00Z, Part 2 due 09-26 14:00Z; miss -> CC-1 takes the surface. Laws: handoff §0/§2/§5.

CC-3 | R-173 PART 1 -- diesel-dedupe finding DIAGNOSED (same shape as the parity ruler) | Rebased
on AUTH-032 CONSUMED too (57 fuel purchases re-dated) -- still red, exact same 190>172. Root-caused
precisely: `verify-diesel-expense-fuel-dedupe.mjs`'s SHRINK-ONLY ratchet counts EVERY live
`accounting.expenses` row with `memo ILIKE 'Diesel%'`, with no `source_fuel_transaction_id` filter.
Measured live: of the 190, ALL 190 have `source_fuel_transaction_id IS NOT NULL` (correctly
fuel-engine-created) -- 0 are the forbidden kind (a regular expense miscategorized as diesel). LAW
4's real invariant ("diesel is never a regular expense") is fully satisfied, 0 violations. The
ratchet's baseline (172, set at some earlier point) does not account for LEGITIMATE new
fuel-engine diesel expenses from ongoing business/reissue activity (AUTH-032's 57, and likely
earlier Faro feed growth) -- it grows whenever a real new diesel purchase is correctly posted,
which is expected, not a defect. Same shape as the parity-ruler issue the Lead already fixed: a
stale ratchet, not a live bug. Not touching accounting.expenses or the guard myself (not my lane,
per "no expense row touched" -- and a guard-baseline call is the Lead's/CC-1's, not a unilateral
CC-3 edit). Holding the push, reporting this precise diagnosis so whoever owns this guard can bump
the baseline or add the source_fuel_transaction_id filter in one clean move.

Cumulative DONE this round (unaffected, all code-only, unchanged): rollup fuel/expenses/net split;
all 5 load boards wired + registered in SIX_SURFACES (11 entries); settlement-summary resolver
fix; 2 new guards (verify-presettlement-shows-whole-tour.mjs, verify-load-views-current-trip-only.mjs),
both live-verified green.

REMAINING once unblocked: push+PR+merge LAW5 (one command away, everything else green); wire Load
Costs/Pre-Settlement/Settlement UI; fix tour-readout.routes.ts's duplicated formula; wire both new
guards into verify-steps/; live proof table (3 loads incl. a 2-load tour -- candidates: open
settlement 5819, 7 loads) by 01:00Z; then Part 2. No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-23.md`.
