# ROUND 173 — CC-3. Load boards identical, then the Settlement Creator. Lead, 2:47 PM CT (19:47Z).
Full order: `~/Downloads/09-25-26-handoff/orders/09-25-2026-CC-3-ROUND-173-...md`. Part 1 due
09-26 01:00Z, Part 2 due 09-26 14:00Z; miss -> CC-1 takes the surface. Laws: handoff §0/§2/§5.

CC-3 | R-173 PART 1 -- ALL 5 LOAD BOARDS WIRED + REGISTERED | (full board-identification reasoning
in archive -18/-19.md). All on LAW5 branch, apps/backend+frontend tsc clean each commit, not yet
pushed -- LAW5 merge still gated on CC-2's check-engine PR (still not open).

DONE:
1. load-cost-rollup.sql.ts: +fuel_cents/+expenses_cents (split of costs_cents,
   source_fuel_transaction_id discriminator, LAW 4's own marker) + net_cents. Live-verified 8 real
   USMCA loads, 0 mismatches.
2. LoadsPlanner.tsx: +Fuel/+Expenses columns, Margin->Net.
3. DispatchBoard.tsx (List): +5 opt-in columns (defaultHidden, locked 5-band layout untouched).
4. DispatchKanban.tsx (Kanban): ALREADY correct -- its badge already calls
   loadProfitability.service.ts, which already calls loadCostRollupLateral internally. No fix needed.
5. RoundTrips.tsx (Round Trips): per-load AND tour-level (SUM across the tour's own legs) --
   directly implements OWNER RULE: THE TOUR (pt 2).
6. TruckLineBoard.tsx (Truck Line): +Fuel/Expenses/Driver Pay/Net row per load.
7. DispatchLoadCostsPanel.tsx (Overview): stopped re-deriving margin locally from a second
   /load-costs-board fetch -- now reads the same rollup; "no costs linked" replaces a fabricated
   $0.00 (pt 4 "blanks say why").
8. All 5 registered in verify-one-source-per-number.mjs's SIX_SURFACES (7 -> 11 entries);
   --selftest PASS, live run exit 0, 0 divergences.

REMAINING: wire Load Costs/Pre-Settlement/Settlement onto the same 5 fields (2 real gaps already
found, not yet fixed: tour-readout.routes.ts hand-copies the formula [numerically correct, 2
maintained copies]; load-settlement-summary.routes.ts resolves via created_at DESC with no
cancelled filter [real current-vs-history bug, both in archive -16.md]); build
verify-load-views-current-trip-only.mjs + verify-presettlement-shows-whole-tour.mjs; FAST-MERGE;
live proof table, 3 real open loads incl. a 2-load tour. Part 2 (Settlement Creator) not started.
Still watching for CC-2's check-engine PR. No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-19.md`.
