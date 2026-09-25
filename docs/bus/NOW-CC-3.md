# ROUND 173 — CC-3. Load boards identical, then the Settlement Creator. Lead, 2:47 PM CT (19:47Z).
Full order: `~/Downloads/09-25-26-handoff/orders/09-25-2026-CC-3-ROUND-173-...md`. Part 1 due
09-26 01:00Z, Part 2 due 09-26 14:00Z; miss -> CC-1 takes the surface. Laws: handoff §0/§2/§5.

CC-3 | R-173 PART 1 IN PROGRESS | The "5 load boards" (not guessed, read from code): DispatchPage's
`ViewMode` type has exactly 5 literal values -- Overview/List/Kanban/Round Trips/Truck Line --
backed by DispatchOverview / DispatchBoard / DispatchKanban / RoundTrips / TruckLineBoard.tsx
(apps/frontend/src/pages/Dispatch.tsx + pages/dispatch/*.tsx). None of the 4 non-List ones showed
any cost/margin figure before this pass (List showed none either); RoundTrips/TruckLineBoard
showed raw rate_total_cents only, not from the shared rollup.

DONE so far (all on LAW5 branch, apps/backend+frontend tsc clean, not yet pushed -- LAW5 merge
still gated on CC-2's check-engine PR):
1. Extended load-cost-rollup.sql.ts with fuel_cents + expenses_cents (strict split of costs_cents,
   discriminator = expenses.source_fuel_transaction_id, LAW 4's own existing marker) + net_cents
   (= margin_cents, ROUND 173's column name). Additive, every existing consumer unaffected.
   Live-verified on 8 real USMCA loads: fuel+expenses==costs on every row, 0 mismatches.
2. LoadsPlanner.tsx: added Fuel + Expenses columns, Margin label -> Net.
3. DispatchBoard.tsx (List board): added Revenue/Fuel/Expenses/Driver Pay/Net as 5 new opt-in
   columns (defaultHidden, respects the locked DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05 5-band
   layout -- no visual change to what's on-screen by default).

REMAINING: wire DispatchKanban/RoundTrips/TruckLineBoard/DispatchOverview the same way; register
all in SIX_SURFACES; wire Load Costs/Pre-Settlement/Settlement onto the same 5 fields (2 real gaps
already found and NOT yet fixed: tour-readout.routes.ts hand-copies the formula,
load-settlement-summary.routes.ts resolves via created_at DESC with no cancelled filter -- both in
archive -16.md); build verify-load-views-current-trip-only.mjs +
verify-presettlement-shows-whole-tour.mjs; FAST-MERGE; live proof table, 3 real open loads incl. a
2-load tour. Part 2 (Settlement Creator) not started -- large net-new feature, starts after Part 1
merges. Still watching for CC-2's check-engine PR. No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-18.md`.
