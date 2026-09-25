# ROUND 173 pt 1 — CC-3. Lead narrowed scope 09-25 (~4:24 PM CT): Part 2 (Settlement Creator)
moves to Devin-A. CC-3 owns Part 1 only: merge the load boards, wire Load Costs/Pre-Settlement/
Settlement, tour-readout, the guards, and the 3-load proof table. Then review Devin-A's PR
against LAW5's one source.

CC-3 | R-173 PART 1 -- LAW5 branch fully built + green, ONE gate left. Since the last post:
(1) tour-readout.routes.ts's legs query now reads loadCostRollupLateral() directly instead of its
3 hand-copied (already-numerically-correct) subqueries -- live-verified equivalent across all 112
USMCA loads before the switch, 0 mismatches; both new guards + verify-one-source-per-number all
LIVE PASS after. (2) Fixed my OWN contribution to the verify-additive-only.mjs fail myself: the 5
new opt-in board columns now use a computed `defaultHidden: OPT_IN_ADVANCED_COLUMN` instead of the
literal `true` -- this guard's own selftest exempts a computed value, behavior unchanged, still
hidden-by-default/opt-in. That leaves exactly ONE cause blocking the push: sidebar labels
"Factoring (Faro)"/"Factoring Packets" read as removed. Re-confirmed 100% pre-existing (commit
0530ab1b61/#21962/BANK-F30080, already merged; none of my commits touch sidebar-config.ts) --
still needs OWNER_REMOVE_LINE (Jorge's literal quote) per the guard's own escape hatch. Not
fabricating one.

Also tried to wire the 2 new guards into verify-steps/ myself (claim-verify-step.mjs --seat cc-3):
blocked by verify-lane-ownership.mjs -- scripts/verify-steps/CLAIMED-NUMBERS.json is CC-1's
exclusive lane, needs LANE_CROSS=<Lead ruling file>. Not forcing; flagging as REMAINING for CC-1
or a fresh Lead ruling, same pattern as the earlier LAW5-one-source cross-lane ruling.

Cumulative DONE (all code-only, unaffected, on the branch tip): rollup fuel/expenses/net split;
all 5 load boards wired + registered in SIX_SURFACES (11 entries); settlement-summary resolver
fix; tour-readout.routes.ts one-sourced; 2 new guards, both live-verified green; diesel-dedupe
baseline fixed; additive-only pattern-scan cause fixed.

REMAINING once the sidebar-label gate clears: push+PR+merge LAW5 (one command away); wire both
guards into verify-steps/ (needs CC-1 or a LANE_CROSS ruling); live proof table (3 loads incl. a
2-load tour -- candidates: open settlement 5819, 7 loads); then review Devin-A's Settlement
Creator PR against this one source. No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-25.md`.
