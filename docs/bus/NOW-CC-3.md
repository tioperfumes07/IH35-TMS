# ROUND 166.1 (addendum) + ROUND 166 — CC-3. Full verbatim orders: `docs/bus/archive/NOW-CC-3-2026-09-25-14.md`.
Lead, latest 1:50 PM CT: R-168 DONE (presettlement_link_id + expense load numbers, live). Proceed
with R-166/166.1 now; rebase LAW5 once after CC-2's check-engine PR merges, gate once. Deadline
21:00Z, miss -> Lead. Do not touch expense rows. No subagents. DONE line: `CC-3 | R-166 DONE |
<sha> | <live sha> | 4 loads x 6 surfaces pasted | NEXT`.

CC-3 | R-166/166.1 IN PROGRESS | Prior findings in archive -15/-16.md (5 load views named,
LoadDetailCostsTab.tsx correction, tour-readout.routes.ts re-derive). New this pass:

DONE: LoadDetailDriverPayTab.tsx wired to the shared rollup (getLoadCostRollup), cross-checks
driver_pay_cents against bill.gross_amount_cents, "adds up"-style tie display. Committed on LAW5
branch (c2f20ed9e0), frontend tsc clean, not yet pushed (still gated on CC-2's PR).

NEW FINDING (real, not yet fixed): `apps/backend/src/dispatch/load-settlement-summary.routes.ts`
(backs LoadDetailSettlementTab.tsx, the Pre-Settlement/Settlement surface) resolves "the" settlement
for a load via `ORDER BY s.created_at DESC LIMIT 1` over EVERY settlement that ever referenced the
load (first/last_load_id OR any settlement_lines row, no `is_active`/`voided_at` filter, no
`s.status <> 'cancelled'` filter) -- it can surface a stale/cancelled/superseded settlement instead
of the load's actual CURRENT one. R-168 just landed presettlement_link_id on every load -- the fix
is to resolve via that pointer first (same precedent as tour-readout.routes.ts's own
DISPATCH-NO-HISTORY logic), not the current created_at heuristic. This is exactly 166.1's own
concern (current trip/settlement only, never historical) -- planned as part of the
verify-load-views-current-trip-only.mjs guard's real target, not a guess.

Deferring further wiring (tour-readout.routes.ts, load-settlement-summary.routes.ts, expense/invoice
surfaces) + both new guards until immediately after LAW5 merges, to build on the corrected
bill_lines-scoped formula rather than duplicate work about to be superseded. Watching for CC-2's
check-engine PR (still not open/merged as of this post). No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-16.md`.
