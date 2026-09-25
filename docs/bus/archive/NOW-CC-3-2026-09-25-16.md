# ROUND 166.1 (addendum) + ROUND 166 — CC-3. Full verbatim orders: `docs/bus/archive/NOW-CC-3-2026-09-25-14.md`.
Lead, 1:02-1:09 PM CT. R-164 DATA DONE (AUTH-021/022/023 CONSUMED, confirmed in
docs/bus/OWNER-AUTHORIZATIONS.md). Waiting on CC-2's check-engine PR (parity ruler change) before
rebase+gate on LAW5, per Lead's 1:09 PM CT instruction. Deadline 21:00Z, miss -> Lead. Do not touch
expense rows. No subagents. DONE line: `CC-3 | R-166 DONE | <sha> | <live sha> | 4 loads x 6
surfaces pasted | NEXT`.

CC-3 | R-166/166.1 IN PROGRESS | 5 load views named from code (full reasoning in archive -14.md):
(1) Load Board = LoadsPlanner.tsx /dispatch/planners/loads; (2) Load Costs Board =
LoadCostsBoardPage.tsx /accounting/load-costs; (3) Load Costs single-load = LoadCostsLoadPage.tsx
/accounting/load-costs/:loadId; (4) Load Detail->Costs tab = LoadDetailCostsTab.tsx; (5) Load
Detail->Driver Pay tab = LoadDetailDriverPayTab.tsx.

CORRECTION to my own prior finding: LoadDetailCostsTab.tsx does NOT re-derive -- line 182-184
already read rollup.data.{costs_cents,driver_pay_cents,revenue_cents} from the shared
getLoadCostRollup() endpoint; line 195's margin only adds an unsaved-draft preview on top (correct
UX, can't come from the DB source). Retracting that half of my earlier post.

REAL FINDING: `apps/backend/src/driver-finance/tour-readout.routes.ts` (feeds TourLoadRows.tsx =
the Pre-Settlement/Settlement surface) hand-copies its OWN revenue/costs/driver_pay/margin SQL
(lines ~155-190) instead of calling loadCostRollupLateral() from load-cost-rollup.sql.ts -- the
formula was already numerically aligned by a prior LAW-5-CROSS-SCREEN fix (2026-09-24, own code
comment cites the canonical file), so today's numbers tie, but it's 2 maintained copies of the same
money math, exactly the re-derive risk R-166 pt 2 forbids. LoadDetailDriverPayTab.tsx reads one
driver_bill row directly (not the rollup's summed driver_pay_cents) -- same class of gap, narrower.
Rewiring both to call the shared function (frontend/backend read-wiring only, no expense-row
writes, safe ahead of the gate). Pre-settlement/settlement = LoadDetailSettlementTab.tsx (same
drawer, dynamic label, not yet wired). Expense view = ExpenseDetailPage.tsx, invoice surface =
InvoiceDetailPage.tsx, both identified, neither wired yet.

Also found (unrelated to this diff, filed for CC-1's lane, not fixed): a NUL byte at
apps/backend/src/feed/seed-settlement-document.service.ts:268 fails
verify-no-nul-bytes-in-source.mjs for every pusher lacking local DB capability -- from R-165's own
merge (6328b2a68d), not touched here.

STILL HOLDING LAW5 gate/push/merge -- now blocked on CC-2's check-engine/parity-ruler PR per Lead's
explicit sequencing, not just R-164. Branch stays synced to main; its own 2 guards were live-green
minutes before R-164 CONSUMED. No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-15.md`.
