# URGENT — CC-3, ~5:48 PM CT. LAW5 (#22749) is merged+deployed, but the live Chrome proof-table
walkthrough it was supposed to close surfaced a SEVERE pre-existing bug in the shared canonical
source itself. Fix in flight (branch claude/fix-load-cost-rollup-lateral-alias-shadow), URGENT
priority, pushing the moment the local gate clears.

**THE BUG:** `apps/backend/src/accounting/load-cost-rollup.sql.ts`'s `loadCostRollupLateral()` --
THE single canonical per-load revenue/costs/driver-pay/margin source every LAW-5 surface reads --
aliased its own internal `FROM mdata.loads l` as `l`, the SAME alias name every real call site's
`loadIdExpr`/`companyExpr` strings assume ("l.id"/"l.operating_company_id"). A LATERAL subquery's
own alias shadows an outer alias of the same name, so `WHERE l.id = ${loadIdExpr}` silently became
`WHERE l.id = l.id` -- an unscoped tautology matching every load in `mdata.loads`, with `LIMIT 1`
(no ORDER BY) returning one arbitrary but query-plan-stable row instead of the intended load.
Live-caught on load 13600 (settlement S-5812) during the Chrome walkthrough: both legs of a 2-load
tour showed the IDENTICAL costs_cents/driver_pay_cents (same arbitrary row fetched twice) instead
of their own real, different figures.

**BLAST RADIUS:** every consumer of `loadCostRollupLateral()` -- `load-cost-rollup.routes.ts`
(Load Costs board + detail tab), `tour-readout.routes.ts` (Pre-Settlement/Settlement, my own R-173
wiring), `load-profitability.service.ts` (Kanban badge), `factoring.routes.ts` (4 call sites --
factoring registers/invoices), `load-unit-cost-split.routes.ts`, `dispatch-margin.routes.ts`. This
was likely wrong since whenever this function was first written -- an EARLIER equivalence check
I ran this session (comparing the old tour-readout formula against "the lateral") used my OWN
hand-written reproduction of the lateral SQL with a DIFFERENT, non-colliding alias -- never
exercising the real shared function -- so it passed clean while the real function stayed broken.
Owner/Lead: if any factoring advance, settlement approval, or other decision was made off a
Costs/Pre-Settlement/Kanban-badge dollar figure recently, it may be worth a live re-check now that
the fix is in.

**FIX (in flight):** rename the lateral's internal alias `l` -> `cl` (zero caller changes needed,
pure additive). NEW guard `scripts/verify-load-cost-rollup-lateral-no-alias-shadow.mjs` --
static arm bans the collision-prone shape, live arm shells to `tsx` to call the REAL function (not
a reproduction) and cross-checks output against independently-computed truth for every load on
every live multi-load tour. LIVE PASS: 10 loads / 5 tours, 0 mismatches. Re-ran every guard this
round already built/touched (one-source-per-number, parity 34/34, settlement-net 35, both new
tour guards) -- all still LIVE PASS after the fix.

REMAINING once pushed/merged: wire the new guard into verify-steps/ (needs LANE_CROSS for
CLAIMED-NUMBERS.json); redo the live Chrome 3-load proof table with now-correct figures; review
Cursor's Settlement Creator PR once it lands. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-28.md`.
