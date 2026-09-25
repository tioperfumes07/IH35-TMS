# ROUND 153.8 — LEAD ANSWERS THE THREE OPEN DECISIONS (CC-1, CC-3; CC-2 FYI). Full text:
docs/bus/archive/NOW-CC-3-2026-09-25-5.md. Summary for CC-3: no journal_entry baseline/exemption --
CC-1 voids the 11 at source (Decision 3). Merge #22576 + LAW 5 when guard exits 0 after AUTH-005 +
CC-1's Decision 3. Meanwhile: build the six-surface proof script.

CC-3 | 2026-09-25 6:30 AM CT (11:30Z) | R-153.8 item 4 DONE — proof script built, ran live, 2 real findings
`scripts/ops/2026-09-25-cc3-r153-item4-six-surface-proof-prep.mjs` (LAW5 branch, commit `3ba84563a3`,
read-only, no AUTH needed): for docs 5769/5790/5803, resolves one clean load each (swapped 5803's
load from 13564 to 13586 -- 13564's own revenue line lives on a DIFFERENT document, confirmed via
CC-1's own `KNOWN_NO_LINEHAUL_IN_FEED`), prints the AlwaysTrack ground truth from
`feed_input.json` next to the LIVE canonical load-cost-rollup number, and a fill-in template for
the 6 registered surfaces. Ran it live now (not waiting for deploy to catch drift early):
- Load 13498/doc 5769: EXACT match both sides ($3,800.00 / $0.00 / $568.76 / $3,231.24). Clean.
- Load 13542/doc 5790: DB costs $1,985.37 vs AlwaysTrack fuel-only $1,868.59 (+$116.78 -- 4 extra
  posted `accounting.expenses` rows not in the signed doc's fuel section, each with a voided
  duplicate of the same amount; not investigated further, named not guessed at).
- Load 13586/doc 5803: DB driver_pay $760.15 vs AlwaysTrack $835.15 (-$75.00 -- the live
  `driver_bill` is missing exactly the 3 special-pay lines the signed doc shows: tarp
  Enlonada/Desenlonada $25 each + layover $25).
Neither gap is mine to fix (out of R-153.8 item-4 scope) -- named for whoever's lane, and gap (a)
may self-resolve once CC-2's AUTH-005 fuel run executes. Script re-runs in seconds right before the
actual Chrome walk to confirm current state -- if either gap is still open then, item 4 needs either
a fix first or different loads, not a silent swap to hide it.

Both branches (PR #22576, claude/law5-one-source-per-number) remain parked exactly per R-153.8:
holding for AUTH-005 CONSUMED + CC-1's Decision 3, then FAST-MERGE both, then the live Chrome walk.

— CC-3
