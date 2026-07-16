# IH35-TMS — Continuous Build Progress
**As of:** 2026-07-16 ~04:53Z · non-stop Cursor slice

| Status | Count |
|--------|------:|
| Merged this wave | 6 (#2535–#2539, #2540) |
| Open | 1 (#2541 draft OB plan) |
| Live SHA | `c667723` (#2538 Relay bridge) — watching deploy for #2539 (`818ce3be9`) |
| Ops blockers | TRANSP Relay: flag ON, rows still **0** — need `RELAY_API_KEY_TRANSP` + backfill |

## MERGED
- **#2535** checksum overrides mig 48–51 (`d18695861`)
- **#2536** 425C petition_date SoR
- **#2537** dispatch/invoice deeplinks
- **#2538** Relay → `fuel.fuel_transactions` bridge (no GL) — **live `c667723`**
- **#2539** QBO Step-2 mdata repoint (`818ce3be9`) — merged; watching Render deploy
- **#2540** CURSOR-AUDIT docs pack

## OPEN
- **#2541** docs(qbo): OB 2026-03-31 live pull plan (draft) — ready after Step-2 live

## NEON / RELAY (TRANSP `91e0bf0a-…`)
| Check | Result |
|-------|--------|
| TRANSP Relay flag | **ON** |
| `integrations.relay_fuel_transactions` | **0** (still — ingest blocked without API key / backfill) |
| `fuel.fuel_transactions` | **0** TRANSP |
| Env still required | `RELAY_API_KEY_TRANSP`, `RELAY_API_BASE`, Manual Restart |
| Backfill | `POST /api/integrations/relay/fuel/backfill` `{"months":24}` |

Checklist: `RELAY-TRANSP-LIVE-CHECKLIST.md` · helper: `OWNER-RELAY-TRANSP-PROOF.sh`

## NEXT
1. Owner Relay ceremony: confirm Render `RELAY_API_KEY_TRANSP` (+ base) → Manual Restart → backfill → Neon count > 0
2. Confirm #2539 deploy live (health / SHA past `c667723`)
3. After Step-2 live: proceed with #2541 OB 03/31 live QBO pull plan (read-only draft)
