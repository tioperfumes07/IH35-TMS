# LEAD RULING — CURSOR RESERVE-ACCOUNT MATCH KINDS — LANE_CROSS

Date: 2026-10-02
Seat: CURSOR
Owner order: `docs/bus/00-OWNER-ORDER-2026-10-02-ALL-CODERS-BUILD-100-PERCENT-NO-HANDOFF.md` §3.1 / §4
CC-2 handoff: `docs/bus/OUTBOX-CC-2.md` (~L1680)

## AUTHORIZATION

Cursor owns the one bank-match engine (`acceptMatchWithResolveDifference`). CC-2 built the Faro
reserve posters (`postFaroReserveEntryOnClient`, `faroReserveDepositsOn`) and the CoA roles on
`accounting.chart_of_accounts_roles`. Cursor wires those posters into the match transaction and
retires the stale `catalogs.account_role_bindings` reserve gate.

LANE_CROSS authorized for:
- `apps/backend/src/accounting/bank-recon/match.service.ts`
- `apps/backend/src/accounting/bank-recon/bank-match-faro-reserve-post.service.ts` (new)
- `scripts/verify-one-bank-match-writer-writes-je.mjs`

## WHAT SHIPS

1. Reserve bank detection → `chart_of_accounts_roles` (`factor_reserve_held` + `factor_cash_reserve_held`).
2. Faro report bank line → `postFaroReserveEntryOnClient` in the match txn (not chargeback).
3. Payment match → `faroReserveDepositsOn` + DR 1235 / CR due-from-affiliate per unposted Rsv Deposit.
4. Repurchase on reserve register with no Faro entry → still `postFactoringChargebackEvent`.

NO post / seed / match / Chrome by seat. Owner verifies in Chrome.
