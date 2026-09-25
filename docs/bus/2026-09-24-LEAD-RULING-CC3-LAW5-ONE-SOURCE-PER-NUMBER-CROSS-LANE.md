# LANE_CROSS ruling — CC-3 building LAW 5 (one source per number)

**Authorization:** `docs/bus/00-THE-BOARD-READ-FIRST.md`, direct: "CC-3 · LOAD BOARD, LOAD COSTS,
PRE-SETTLEMENT, SETTLEMENT — MAKE THEM ALL SHOW THE SAME THING. This is the surface the owner
named and it is yours... Prove it by opening a load and showing the same revenue, the same
costs, the same driver pay and the same margin on the load board, in load costs, on the
pre-settlement and on the settlement... Guard: verify-one-source-per-number.mjs."

## Scope of the cross

`apps/backend/src/driver-finance/tour-readout.routes.ts` (bill-cost formula fixed to match the
canonical `load-cost-rollup.sql.ts` shape — load-scoped `bill_lines.amount`, not a bill's whole
header total), `apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx` (KPI grid now
reads the company-scoped settlement report once loaded, matching `CompanyWaterfallSection`'s
already-shipped fix), and the new guard `scripts/verify-one-source-per-number.mjs` (CC-3's own
scripts/verify-*.mjs lane).

## Ruling

CC-3 may author, commit, and push these files in one PR. `LANE_CROSS=2026-09-24-LEAD-RULING-CC3-
LAW5-ONE-SOURCE-PER-NUMBER-CROSS-LANE.md` at push time, and the same line in the PR body.
