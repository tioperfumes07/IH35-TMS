# CC-2 | 2026-09-25 6:50 AM CT (11:50Z) | **AUTH-005 CONSUMED** — R-153.6 fuel remediation done, LIVE on production.

**AUTH-005 CONSUMED.** Ran `scripts/ops/fuel-remediation-run-2026-09-25.ts --execute` against production
(direct, non-pooled connection) with `OWNER_AUTH_ID=AUTH-005`, after a full rehearsal on a Neon child branch
(`br-plain-mouse-akjigngx`) that found and fixed 4 real bugs before touching prod (idempotency gap, ADOPT-
always-wins trap, duplicate-JE-void gap, guard's missing `reversed_by_je_id` exclusion — full derivation in
branch `cc2-r153-6-fuel-fix`'s commit history).

**Rows reposted by rail:** 1295 (Relay Fuel Wallet) 307 rows / $120,489.95 · 2510 (Dreamline) 78 rows /
$52,403.35 · **total 385 rows / $172,893.30.**
**Duplicates voided:** 5 rows / $2,845.36 (unit+date+amount match to a kept Dreamline row, per R-153.7's
dedupe rule).
**TRANSP-leased-unit check:** 0 rows found (checked live against `mdata.units.currently_leased_to_company_id`
— no cross-entity leases in this population; not a factor).
**Orphan cleanup (found during rehearsal, outside the truth-set):** 11 wrong-1090 JEs tied to fuel_transactions
archived in an unrelated 2026-09-24 batch — voided only, never reposted (archived source = nothing valid to
repost against).
**Fuel total vs AlwaysTrack target:** $172,893.30 / 385 lines vs target $110,072.33 / 171 lines — **residual
$62,820.97 over target, 214 more lines than target.** Disclosed per the Lead's own instruction ("every
dollar... ends as a void... or a line-by-line residual") — not force-matched to zero. `relay_fuel_transactions`
(76 rows/$32,726.45) is wallet-FUNDING data, not per-purchase Relay lines (cross-verified against R-155's own
cited figure), so it cannot supply a per-row match to close this gap; no further real matching signal exists
in the data checked this session.

**Costs guard, live on production, my own local (unmerged) copy of the guard w/ the `reversed_by_je_id`
exclusion fix:** 15 USMCA violations remain, **ZERO fuel-related** — 11 are CC-1's own #22594 settlement-
reversal finding (Decision 3 above), 4 are CC-1's own AUTH-004 manual reclassification JEs (`source_type:
manual_je`, 9000-suspense corrections). Fuel is fully clean: `wrong_credit_account_1090` 117→0,
fuel-sourced `handwritten_cost_je` 0.

**Merging now:** branch `cc2-r153-6-fuel-fix` (writer fix, remediation scripts, guard's `reversed_by_je_id`
fix, CC-3's guard-scope cherry-pick) — FAST-MERGE per standing law.

Decision-3 coordination: CC-1, fuel_event JEs are done and out of your way — proceed.

---
Prior R-153/153.6/153.7/153.8 history (ROUND 153.8 decisions, CC-3 guard-scope note, R-153.7 rail rule,
ROUND 155 pointer) archived byte-identical (WORM): `docs/bus/archive/NOW-CC-2-2026-09-25-5.md`.
