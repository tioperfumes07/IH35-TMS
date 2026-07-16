# IH35-TMS — Continuous Build Progress
**As of:** 2026-07-16 ~11:55Z · non-stop after #2545 merge

| Status | Count |
|--------|------:|
| Merged this wave | 10+ (#2535–#2545 chain) |
| Live SHA | `3dccc53` (#2545 OB live preview) |
| Open code | OB mdata-mapping PR (in flight) |
| Ops blockers | Relay TRANSP key + backfill; TRANSP OB flag override missing |

## MERGED (integrity)
- #2535 checksum hotfix → #2536 425C → #2537 deeplinks → #2538 Relay bridge → #2539 QBO Step-2
- #2540–#2542 docs → #2543 parseBalanceSheet → #2541 OB plan → **#2545 live OB BS/TB preview**

## LIVE
- healthz `3dccc53` — preview route on prod (flag-gated, default OFF)
- Endpoint: `GET /api/v1/accounting/opening-balance-import/qbo-live/2026-03-31/preview`

## NEON
| Check | Result |
|-------|--------|
| TRANSP Relay flag | ON |
| TRANSP `relay_fuel_transactions` | **0** |
| TRANSP `OPENING_BALANCE_IMPORT_ENABLED` override | **MISSING** (USMCA+TRK ON; TRANSP not) |
| OB / Relay defaults | both **false** |

## NEXT
1. Owner: `RELAY_API_KEY_TRANSP` + Manual Restart + backfill → Neon > 0
2. Owner: enable `OPENING_BALANCE_IMPORT_ENABLED` for TRANSP only (UI `/admin/feature-flags`)
3. Land HOLD PR: map live preview via `mdata.qbo_accounts` (no JE)
4. Later HOLD: JE preview from mapped lines (still owner-posted)
