# LEAD RULING — CURSOR FT1 Factoring Payments drill, lane cross into CC-2 read paths

2026-10-01 · Cursor Lead · authorizes LANE_CROSS for this filename

## Scope (this PR / branch only)

Cursor `cursor/ft1-payments-drilldown-6f2f` (ROUND 315 FT1) may touch:

- `apps/backend/src/factoring/purchase.service.ts` — **read-only detail extension**
  (`bank_account_id` on `getPurchaseDetail`; no posting / GL change)
- `apps/backend/src/banking/bank-tieout.service.ts` — **drill subquery only**
  (`factoring_purchase_id` on `tieoutDrill` feed_only rows)
- `scripts/entity-link-adoption-baseline.json` — intentional regen after
  `factoring_purchase` EntityLink adoption

## Why

FACTORING-TAKEOVER B4–B7 shipped the purchase engine (CC-2) and Payments-to-You UI (Cursor).
FT1 closes drill gaps (wire → purchase → bank tie-out both ways) without a second engine or
posting path. CC-2 purchase poster remains authoritative; these are list/detail/drill reads only.

## Gate

Run money-pr-local-gate with:

`LANE_CROSS=2026-10-01-LEAD-RULING-CURSOR-FT1-FACTORING-PAYMENTS-LANE-CROSS.md`

Name the same file in the PR body.
