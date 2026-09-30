# Cursor ROUND 285.4.4 — Load Costs wizard amounts

## WHAT
`LoadCostsBoardPage` + `DispatchLoadCostsPanel` render Book Load wizard charges from
`dispatch.load_charge_lines`: line haul, fuel surcharge, accessorials, detention, layover.

## SOURCE
Shared pivot `apps/backend/src/accounting/load-wizard-charges.sql.ts`, joined from
`load-costs-board.routes.ts` and `load-cost-rollup.sql.ts` (one formula).

## LIVE (THE CLOSE grepped first)
Open_dispatch loads (not named in `00-THE-CLOSE-LOCKED…`): 13624, 13627–13632, 13635–13639
(n=12). Each has active `linehaul` charge = `rate_total_cents`. FSC / accessorials / detention /
layover = 0 on this set (dash on screen — honesty, not invention).

## GUARD
`scripts/verify-load-costs-wizard-amounts.mjs` — static + live; LAW.json registered.
Manifest + column-contract updated for additive columns (24).

## CANCELLED (do not reopen)
Reissue 8 Transportation invoices · investigate 13553 · driver bills for 13502/13505/13507.
